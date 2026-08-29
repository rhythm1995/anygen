import { Injectable } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";

import { SupabaseClientFactory } from "../auth/supabase.client";

export interface LedgerEntry {
  cents: number;
  reason: string;
  taskId: string | null;
  balanceAfterCents: number;
}

/** supabase-js 的 error 是普通对象，统一包成 Error（Jest/HTTP 层都需要真 Error） */
export function unwrap<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

/**
 * 美分账本（CONCLUSIONS D2：内部使用，美元美分整数记账，无赠金无支付）。
 * 原子性由 DB RPC（supabase/migrations/0005_cn_creation_billing.sql）保证。
 */
@Injectable()
export class CreditsService {
  private get supabase(): SupabaseClient {
    return this.factory.serviceClient;
  }

  constructor(private readonly factory: SupabaseClientFactory) {}

  async balance(userId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from("profiles")
      .select("balance_cents")
      .eq("id", userId)
      .maybeSingle();
    return unwrap({ data, error })?.balance_cents ?? 0;
  }

  /** admin 开户时的一次性入账（reason=initial_grant），金额 admin 配置 */
  async grantInitial(userId: string, amountCents: number): Promise<number> {
    const { data, error } = await this.supabase.rpc("grant_cents", {
      p_user: userId,
      p_amount: amountCents,
      p_reason: "initial_grant",
    });
    return unwrap({ data, error }) as number;
  }

  /** 原子扣减；余额不足返回 false（不抛错） */
  async tryDebit(userId: string, costCents: number, taskId?: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc("try_debit_cents", {
      p_user: userId,
      p_cost: costCents,
      p_task: taskId ?? null,
    });
    return Boolean(unwrap({ data, error }));
  }

  /** 按任务幂等退款；重复退款返回 false */
  async refund(userId: string, amountCents: number, taskId: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc("refund_cents", {
      p_user: userId,
      p_amount: amountCents,
      p_task: taskId,
    });
    return Boolean(unwrap({ data, error }));
  }

  async ledger(userId: string): Promise<LedgerEntry[]> {
    const { data, error } = await this.supabase
      .from("ledger")
      .select("cents,reason,task_id,balance_after_cents")
      .eq("user_id", userId)
      .order("id", { ascending: true });
    return (unwrap({ data, error }) ?? []).map((r: any) => ({
      cents: r.cents,
      reason: r.reason,
      taskId: r.task_id,
      balanceAfterCents: r.balance_after_cents,
    }));
  }

  /** admin 手动调整（reason=admin_adjust），需 AdminGuard 上游保证 */
  async adminAdjust(userId: string, deltaCents: number): Promise<number> {
    const abs = Math.abs(deltaCents);
    if (abs === 0) throw new Error("adjust amount must be non-zero");
    if (deltaCents > 0) {
      const { data, error } = await this.supabase.rpc("grant_cents", {
        p_user: userId, p_amount: abs, p_reason: "admin_adjust",
      });
      return unwrap({ data, error }) as number;
    }
    const ok = await this.tryDebit(userId, abs);
    if (!ok) throw new Error("insufficient balance for admin adjustment");
    // 把刚生成的流水行（无 task 关联的最新 generation 行）标记为 admin_adjust
    const latest = await this.supabase
      .from("ledger")
      .select("id")
      .eq("user_id", userId)
      .eq("reason", "generation")
      .is("task_id", null)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest.data?.id) {
      await this.supabase.from("ledger").update({ reason: "admin_adjust" }).eq("id", latest.data.id);
    }
    return this.balance(userId);
  }
}
