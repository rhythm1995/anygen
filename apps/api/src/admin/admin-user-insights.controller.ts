import { Controller, Get, HttpException, Param, UseGuards } from "@nestjs/common";

import { SupabaseJwtGuard } from "../auth/auth.guard";
import { SupabaseClientFactory } from "../auth/supabase.client";
import { unwrap } from "../credits/credits.service";
import { AdminGuard } from "./admin.guard";

/** D10 用户洞察：admin_user_stats RPC 返回的每用户聚合（迁移 0011） */
type UserStats = {
  tasks_total: number;
  tasks_succeeded: number;
  tasks_failed: number;
  tasks_image: number;
  tasks_video: number;
  spend_cents: number;
  refund_cents: number;
  granted_cents: number;
  agent_sessions: number;
  agent_spent_cents: number;
  assets: number;
  projects: number;
  chats: number;
};

const ZERO_STATS: UserStats = {
  tasks_total: 0, tasks_succeeded: 0, tasks_failed: 0, tasks_image: 0, tasks_video: 0,
  spend_cents: 0, refund_cents: 0, granted_cents: 0,
  agent_sessions: 0, agent_spent_cents: 0,
  assets: 0, projects: 0, chats: 0,
};

/** 内部规模上限与 /admin/users 一致：前 200 个用户 */
const USER_LIMIT = 200;

@Controller("admin")
@UseGuards(SupabaseJwtGuard, AdminGuard)
export class AdminUserInsightsController {
  constructor(private readonly factory: SupabaseClientFactory) {}

  private get db() {
    return this.factory.serviceClient;
  }

  @Get("insights/users")
  async list() {
    const [profiles, statsRows, authUsers] = await Promise.all([
      unwrap(
        await this.db
          .from("profiles")
          .select("id,name,role,balance_cents,created_at")
          .order("created_at", { ascending: false })
          .limit(USER_LIMIT),
      ),
      unwrap(await this.db.rpc("admin_user_stats")),
      this.db.auth.admin.listUsers({ page: 1, perPage: USER_LIMIT }),
    ]);
    const emails = new Map((authUsers.data?.users ?? []).map((u) => [u.id, u.email ?? ""]));
    const stats = new Map(((statsRows as (UserStats & { user_id: string })[] | null) ?? []).map((s) => [s.user_id, s]));
    return (profiles ?? []).map((p) => ({
      ...p,
      email: emails.get(p.id) ?? "",
      stats: stats.get(p.id) ?? ZERO_STATS,
    }));
  }

  @Get("insights/users/:id")
  async detail(@Param("id") id: string) {
    const profile = unwrap(await this.db
      .from("profiles")
      .select("id,name,avatar_url,role,balance_cents,created_at")
      .eq("id", id)
      .maybeSingle());
    if (!profile) throw new HttpException("user not found", 404);

    const [statsRows, authUser, recentTasks, recentLedger, recentAgentSessions] = await Promise.all([
      unwrap(await this.db.rpc("admin_user_stats", { p_user: id })),
      this.db.auth.admin.getUserById(id),
      unwrap(
        await this.db
          .from("generation_tasks")
          .select("id,type,model_code,status,cost_cents,prompt,created_at")
          .eq("user_id", id)
          .order("created_at", { ascending: false })
          .limit(15),
      ),
      unwrap(
        await this.db
          .from("ledger")
          .select("id,cents,reason,task_id,balance_after_cents,created_at")
          .eq("user_id", id)
          .order("id", { ascending: false })
          .limit(30),
      ),
      unwrap(
        await this.db
          .from("agent_sessions")
          .select("id,skill_id,prompt,status,budget_cents,spent_cents,created_at")
          .eq("user_id", id)
          .order("created_at", { ascending: false })
          .limit(10),
      ),
    ]);
    const stats = ((statsRows as (UserStats & { user_id: string })[] | null) ?? [])[0];
    return {
      ...profile,
      email: authUser.data?.user?.email ?? "",
      stats: stats ?? ZERO_STATS,
      recent_tasks: recentTasks,
      recent_ledger: recentLedger,
      recent_agent_sessions: recentAgentSessions,
    };
  }
}
