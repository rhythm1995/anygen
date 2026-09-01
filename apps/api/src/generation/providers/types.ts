import type { GenerationType } from "@dreamina/shared";

export const GENERATION_PROVIDER = Symbol("GENERATION_PROVIDER");
export const OPENROUTER_PROVIDER = Symbol("OPENROUTER_PROVIDER");
export const OPENMONTAGE_PROVIDER = Symbol("OPENMONTAGE_PROVIDER");

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

export interface ProviderCredentials {
  apiKey: string;
  baseUrl?: string;
}

export interface GenerationProvider {
  readonly name: string;
  submit(input: ProviderSubmitInput): Promise<ProviderSubmitResult>;
  poll(remoteId: string): Promise<ProviderPollResult>;
  /** 同步型供应商（如 OpenRouter 图像）可另行实现 submitImage */
  submitImage?(model: string, prompt: string): Promise<ProviderSubmitResult>;
  /** D14：请求时注入 admin/env 密钥，不钉死进程启动时的 env */
  withCredentials?(creds: ProviderCredentials): GenerationProvider;
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
