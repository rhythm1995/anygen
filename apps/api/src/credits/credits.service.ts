import { Injectable } from "@nestjs/common";
import type { CreditReason } from "@dreamina/shared";

import { SupabaseClientFactory } from "../auth/supabase.client";

export interface LedgerEntry {
  delta: number;
  reason: CreditReason;
  taskId: string | null;
  balanceAfter: number;
}

/** supabase-js 的 error 是普通对象，统一包成 Error（Jest/HTTP 层都需要真 Error） */
function unwrap<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

/**
 * 积分账本。原子性由 DB RPC（supabase/migrations/0003_credit_rpc.sql）保证：
 * try_debit_credit / refund_credit / grant_credit。
 */
@Injectable()
export class CreditsService {
  private get supabase() {
    return this.factory.serviceClient;
  }

  constructor(private readonly factory: SupabaseClientFactory) {}

  async balance(userId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from("profiles")
      .select("credit_balance")
      .eq("id", userId)
      .maybeSingle();
    return unwrap({ data, error })?.credit_balance ?? 0;
  }

  async grant(userId: string, amount: number, reason: CreditReason = "topup"): Promise<number> {
    const { data, error } = await this.supabase.rpc("grant_credit", {
      p_user: userId,
      p_amount: amount,
      p_reason: reason,
    });
    return unwrap({ data, error }) as number;
  }

  /** 原子扣减；余额不足返回 false（不抛错） */
  async tryDebit(userId: string, cost: number, taskId?: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc("try_debit_credit", {
      p_user: userId,
      p_cost: cost,
      p_task: taskId ?? null,
    });
    return Boolean(unwrap({ data, error }));
  }

  /** 按任务幂等退款；重复退款返回 false */
  async refund(userId: string, amount: number, taskId: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc("refund_credit", {
      p_user: userId,
      p_amount: amount,
      p_task: taskId,
    });
    return Boolean(unwrap({ data, error }));
  }

  async ledger(userId: string): Promise<LedgerEntry[]> {
    const { data, error } = await this.supabase
      .from("credit_ledger")
      .select("delta,reason,task_id,balance_after")
      .eq("user_id", userId)
      .order("id", { ascending: true });
    return (unwrap({ data, error }) ?? []).map((r: any) => ({
      delta: r.delta,
      reason: r.reason,
      taskId: r.task_id,
      balanceAfter: r.balance_after,
    }));
  }
}
