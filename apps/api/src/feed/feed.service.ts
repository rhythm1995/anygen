import { Injectable } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";

import { SupabaseClientFactory } from "../auth/supabase.client";
import { feedItem } from "@dreamina/shared";

export const FEED_PAGE_SIZE = 20;

@Injectable()
export class FeedService {
  constructor(private readonly factory: SupabaseClientFactory) {}

  async page(offset: number) {
    const { data, error } = await this.factory.serviceClient
      .from("feed_items")
      .select("*")
      .order("sort_key", { ascending: true })
      .range(offset, offset + FEED_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const items = (data ?? []).map((row: any) => ({
      id: row.id,
      title: row.title,
      coverUrl: row.cover_url,
      width: row.width,
      height: row.height,
      authorName: row.author_name,
      authorAvatar: row.author_avatar,
      modelReqKey: row.model_req_key,
      generateType: row.generate_type,
    }));
    return {
      items,
      hasMore: items.length === FEED_PAGE_SIZE,
      nextOffset: offset + items.length,
    };
  }
}

// re-export 供单测复用（契约对齐：feed_item 字段结构与 shared 一致）
export { feedItem };
