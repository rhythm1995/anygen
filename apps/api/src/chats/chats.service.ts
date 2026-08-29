import { Injectable } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";

import { SupabaseClientFactory } from "../auth/supabase.client";

@Injectable()
export class ChatsService {
  constructor(private readonly factory: SupabaseClientFactory) {}

  private get db(): SupabaseClient {
    return this.factory.serviceClient;
  }

  async list(userId: string) {
    const { data, error } = await this.db
      .from("chats")
      .select("id,title,created_at,updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async create(userId: string, input: { title?: string }) {
    const { data, error } = await this.db
      .from("chats")
      .insert({ user_id: userId, title: input.title?.slice(0, 120) || "New chat" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async messages(userId: string, chatId: string) {
    const { data, error } = await this.db
      .from("messages")
      .select("id,role,content,task_ids,created_at")
      .eq("user_id", userId)
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async appendMessage(userId: string, chatId: string, input: { role: "user" | "assistant"; content: string; taskIds?: string[] }) {
    const { data, error } = await this.db
      .from("messages")
      .insert({ user_id: userId, chat_id: chatId, role: input.role, content: input.content, task_ids: input.taskIds ?? [] })
      .select()
      .single();
    if (error) throw new Error(error.message);
    await this.db.from("chats").update({ title: input.role === "user" && input.content ? input.content.slice(0, 60) : undefined }).eq("id", chatId);
    return data;
  }
}
