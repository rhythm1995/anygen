import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssetKind } from "@dreamina/shared";

import { ConfigService } from "../config/config.service";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "audio/wav",
  "application/pdf",
]);

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

@Injectable()
export class StorageService {
  private client: S3Client | null = null;

  constructor(private readonly config: ConfigService) {
    if (config.useS3) {
      this.client = new S3Client({
        endpoint: config.s3Endpoint,
        region: config.s3Region,
        forcePathStyle: true,
        credentials: {
          accessKeyId: config.s3AccessKey!,
          secretAccessKey: config.s3SecretKey!,
        },
      });
    }
  }

  /** 测试注入点 */
  static withClient(config: ConfigService, client: S3Client | null): StorageService {
    const svc = Object.create(StorageService.prototype) as StorageService;
    (svc as any).config = config;
    (svc as any).client = client;
    return svc;
  }

  private assertConfigured(): void {
    if (!this.client) throw new HttpError(503, "object storage not configured");
  }

  async presign(input: { userId: string; filename: string; contentType: string; kind: AssetKind }) {
    this.assertConfigured();
    if (!ALLOWED_MIME.has(input.contentType)) {
      throw new HttpError(400, `contentType not allowed: ${input.contentType}`);
    }
    const ext = (input.filename.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
    const key = `${input.kind}/${input.userId}/${randomUUID()}${ext ? "." + ext : ""}`;
    const expiresIn = 900;
    const cmd = new PutObjectCommand({ Bucket: this.config.s3Bucket, Key: key, ContentType: input.contentType });
    const url = await getSignedUrl(this.client!, cmd, { expiresIn });
    return { url, key, expiresIn, publicUrl: this.publicUrl(key) };
  }

  publicUrl(key: string): string {
    return `${this.config.cdnBaseUrl}/${key}`;
  }

  /** 上传完成后的登记（幂等：storage_key unique，冲突返回已有行） */
  async register(
    supabase: SupabaseClient,
    input: { userId: string; key: string; kind: AssetKind; mime: string; width?: number; height?: number; sizeBytes?: number; meta?: Record<string, unknown> },
  ) {
    const row = {
      user_id: input.userId,
      kind: input.kind,
      storage_key: input.key,
      url: this.publicUrl(input.key),
      mime: input.mime,
      width: input.width ?? null,
      height: input.height ?? null,
      size_bytes: input.sizeBytes ?? null,
      meta: input.meta ?? {},
    };
    const { data, error } = await supabase
      .from("assets")
      .upsert(row, { onConflict: "storage_key", ignoreDuplicates: false })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  /** 生成产物转存：远端 URL → 拉取 → S3 上传（不经过前端） */
  async uploadFromUrl(input: { key: string; remoteUrl: string; contentType: string }): Promise<{ key: string; bytes: number }> {
    this.assertConfigured();
    const res = await fetch(input.remoteUrl);
    if (!res.ok) throw new HttpError(502, `fetch remote asset failed: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await this.client!.send(
      new PutObjectCommand({ Bucket: this.config.s3Bucket, Key: input.key, ContentType: input.contentType, Body: buf }),
    );
    return { key: input.key, bytes: buf.length };
  }
}
