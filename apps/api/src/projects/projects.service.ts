import { Injectable } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";

import { SupabaseClientFactory } from "../auth/supabase.client";
import { validateCanvasGraph } from "@dreamina/shared";

export class GraphValidationError extends Error {
  readonly status = 422;
}

@Injectable()
export class ProjectsService {
  constructor(private readonly factory: SupabaseClientFactory) {}

  private get db(): SupabaseClient {
    return this.factory.serviceClient;
  }

  async list(userId: string) {
    const { data, error } = await this.db
      .from("projects")
      .select("id,name,thumbnail_url,graph_version,created_at,updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async get(userId: string, id: string) {
    const { data, error } = await this.db.from("projects").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
    if (error) throw new Error(error.message);
    return data; // 他人项目 RLS 挡掉 → null → 404
  }

  async create(userId: string, input: { name?: string }) {
    const { data, error } = await this.db
      .from("projects")
      .insert({ user_id: userId, name: input.name?.slice(0, 120) || "New project", graph: { nodes: [], edges: [] } })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async patch(userId: string, id: string, input: { name?: string; graph?: unknown }) {
    if (input.graph !== undefined) {
      const verdict = validateCanvasGraph(input.graph);
      if (!verdict.ok) throw new GraphValidationError(verdict.reason);
    }
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name.slice(0, 120);
    if (input.graph !== undefined) patch.graph = input.graph;
    const { data, error } = await this.db
      .from("projects")
      .update(patch)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async remove(userId: string, id: string) {
    const { error } = await this.db.from("projects").delete().eq("id", id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { deleted: true };
  }
}
