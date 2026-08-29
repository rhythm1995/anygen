import { Injectable } from "@nestjs/common";

@Injectable()
export class ConfigService {
  private readonly env = process.env;

  get apiPort(): number {
    return Number(this.env.API_PORT ?? 3001);
  }

  get supabaseUrl(): string | undefined {
    return this.env.SUPABASE_URL;
  }

  get supabaseServiceRoleKey(): string | undefined {
    return this.env.SUPABASE_SERVICE_ROLE_KEY;
  }

  get supabaseAnonKey(): string | undefined {
    return this.env.SUPABASE_ANON_KEY;
  }

  get useSupabase(): boolean {
    return Boolean(this.supabaseUrl && this.supabaseServiceRoleKey);
  }

  get s3Endpoint(): string | undefined {
    return this.env.S3_ENDPOINT;
  }

  get s3Region(): string {
    return this.env.S3_REGION ?? "us-east-1";
  }

  get s3Bucket(): string | undefined {
    return this.env.S3_BUCKET;
  }

  get s3AccessKey(): string | undefined {
    return this.env.S3_ACCESS_KEY;
  }

  get s3SecretKey(): string | undefined {
    return this.env.S3_SECRET_KEY;
  }

  get cdnBaseUrl(): string | undefined {
    return this.env.CDN_BASE_URL;
  }

  get useS3(): boolean {
    return Boolean(this.s3Endpoint && this.s3Bucket && this.s3AccessKey && this.s3SecretKey && this.cdnBaseUrl);
  }

  get arkBaseUrl(): string | undefined {
    return this.env.ARK_BASE_URL;
  }

  get arkApiKey(): string | undefined {
    return this.env.ARK_API_KEY || undefined;
  }

  get arkImageModel(): string | undefined {
    return this.env.ARK_IMAGE_MODEL;
  }

  get arkVideoModel(): string | undefined {
    return this.env.ARK_VIDEO_MODEL;
  }

  get useArk(): boolean {
    return Boolean(this.arkBaseUrl && this.arkApiKey);
  }

  get generationTimeoutMs(): number {
    return Number(this.env.GENERATION_TIMEOUT_MS ?? 600_000);
  }

  get initialGrantCents(): number {
    return Number(this.env.INITIAL_GRANT_CENTS ?? 500);
  }
}
