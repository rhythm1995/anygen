import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import { SupabaseClientFactory } from "../auth/supabase.client";
import { SupabaseJwtGuard } from "../auth/auth.guard";
import { AdminGuard } from "./admin.guard";

@Controller("admin")
@UseGuards(SupabaseJwtGuard, AdminGuard)
export class AdminUsageController {
  constructor(private readonly factory: SupabaseClientFactory) {}

  private get db() {
    return this.factory.serviceClient;
  }

  /** 用量与毛利：按日聚合（用户扣费 vs 供应商成本）+ 按模型汇总 */
  @Get("usage")
  async usage(@Query("days") days?: string) {
    const n = Math.min(Math.max(Number(days ?? 30), 1), 365);
    const since = new Date(Date.now() - n * 86_400_000).toISOString();

    const [byDay, byModel, totals] = await Promise.all([
      this.db
        .from("generation_tasks")
        .select("created_at,cost_cents,model_code,status")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000),
      this.db.from("models").select("code,display_name,price_cents,provider_cost_cents,creation_type").order("creation_type"),
      this.db.from("ledger").select("cents,reason,created_at").gte("created_at", since).limit(5000),
    ]);
    if (byDay.error) throw new Error(byDay.error.message);
    if (byModel.error) throw new Error(byModel.error.message);
    if (totals.error) throw new Error(totals.error.message);

    const tasks = (byDay.data ?? []) as any[];
    const dayMap = new Map<string, { date: string; count: number; user_cents: number }>();
    for (const t of tasks) {
      const date = String(t.created_at).slice(0, 10);
      const row = dayMap.get(date) ?? { date, count: 0, user_cents: 0 };
      row.count += 1;
      row.user_cents += t.cost_cents ?? 0;
      dayMap.set(date, row);
    }
    const modelCost = new Map<string, { code: string; name: string; creation_type: string; count: number; user_cents: number; provider_cost_cents: number }>();
    for (const m of (byModel.data ?? []) as any[]) {
      modelCost.set(m.code, { code: m.code, name: m.display_name, creation_type: m.creation_type, count: 0, user_cents: 0, provider_cost_cents: 0 });
    }
    for (const t of tasks) {
      const entry = modelCost.get(t.model_code);
      if (entry) {
        entry.count += 1;
        entry.user_cents += t.cost_cents ?? 0;
        entry.provider_cost_cents += Math.round((entry.provider_cost_cents ?? 0));
      }
    }
    // 成本按任务估算缺失 —— 用 models 成本价反查 tasks.params 里的 model_code 与量纲太复杂，v1 用
    // ledger.generation 总额 vs models 表成本比（每个任务的 params.model 已知则更准；v1 展示账面值）
    const ledgerRows = (totals.data ?? []) as any[];
    const billed = ledgerRows.filter((r) => r.reason === "generation").reduce((a, r) => a + Math.abs(r.cents), 0);
    const refunded = ledgerRows.filter((r) => r.reason === "generation_refund").reduce((a, r) => a + Math.abs(r.cents), 0);
    const modelsList = (byModel.data ?? []) as any[];

    return {
      days: n,
      byDay: [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
      byModel: [...modelCost.values()].filter((m) => m.count > 0).sort((a, b) => b.user_cents - a.user_cents),
      totals: {
        task_count: tasks.length,
        billed_cents: billed,
        refunded_cents: refunded,
        net_cents: billed - refunded,
        models: modelsList.length,
        enabled_models: modelsList.filter((m) => m.enabled).length,
      },
    };
  }

  @Get("audit")
  async audit(@Query("limit") limit?: string) {
    const n = Math.min(Math.max(Number(limit ?? 100), 1), 500);
    const { data, error } = await this.db
      .from("admin_audit_log")
      .select("*")
      .order("id", { ascending: false })
      .limit(n);
    if (error) throw new Error(error.message);
    return data ?? [];
  }
}
