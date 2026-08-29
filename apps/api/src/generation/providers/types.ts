import type { GenerationType } from "@dreamina/shared";

export const GENERATION_PROVIDER = Symbol("GENERATION_PROVIDER");

export interface ProviderSubmitInput {
  type: GenerationType;
  prompt: string;
  params: Record<string, unknown>;
}

export interface ProviderSubmitResult {
  /** 远端任务 id（异步 API）；同步 API 无任务 id 时为 null */
  remoteId: string | null;
  /** 同步 API（如文生图）立即返回的产物 URL */
  immediateUrls?: string[];
}

export interface ProviderPollResult {
  status: "queued" | "running" | "succeeded" | "failed";
  urls?: string[];
  error?: string;
}

export interface GenerationProvider {
  readonly name: string;
  submit(input: ProviderSubmitInput): Promise<ProviderSubmitResult>;
  poll(remoteId: string): Promise<ProviderPollResult>;
}

export class ProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderError";
  }
}

export class MissingProviderConfig extends Error {
  constructor(what: string) {
    super(`Provider config missing: ${what}`);
    this.name = "MissingProviderConfig";
  }
}
