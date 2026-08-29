import { Injectable } from "@nestjs/common";

import { SupabaseClientFactory } from "../auth/supabase.client";

@Injectable()
export class AdminAuditService {
  constructor(private readonly factory: SupabaseClientFactory) {}

  async record(entry: { adminId: string; action: string; targetTable: string; targetId: string; diff?: Record<string, unknown> }) {
    const { error } = await this.factory.serviceClient.from("admin_audit_log").insert({
      admin_id: entry.adminId,
      action: entry.action,
      target_table: entry.targetTable,
      target_id: entry.targetId,
      diff: entry.diff ?? {},
    });
    if (error) throw new Error(error.message);
  }
}
