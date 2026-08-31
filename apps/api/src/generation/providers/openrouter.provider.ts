import type { GenerationProvider, ProviderPollResult, ProviderSubmitInput, ProviderSubmitResult } from "./types";
import { MissingProviderConfig, ProviderError } from "./types";

export interface OpenRouterProviderOptions {
  baseUrl: string;
  apiKey: string;
  /** 注入点：测试用可替换的 fetch */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** 已知走 chat.completions 出图的模型；其余默认走 /images/generations（b64_json） */
const CHAT_ROUTE_MODELS = new Set([
  "x-ai/grok-imagine-image-2.0",
  "google/gemini-3.1-flash-lite-image",
  "google/gemini-3.1-flash-image",
  "google/gemini-3-pro-image",
]);

/**
 * OpenRouter 适配器。图像生成全部为同步接口：submit 即返回产物（data URL）。
 * - chat 路由：POST /chat/completions → choices[0].message.images[].image_url.url
 * - images 路由：POST /images/generations → data[].b64_json
 */
export class OpenRouterProvider implements GenerationProvider {
  readonly name = "openrouter";
  private readonly fetch: typeof fetch;

  constructor(private readonly opts: OpenRouterProviderOptions) {
    this.fetch = opts.fetchImpl ?? globalThis.fetch;
  }

  private assertConfigured(): void {
    if (!this.opts.apiKey) throw new MissingProviderConfig("OPENROUTER_API_KEY");
    if (!this.opts.baseUrl) throw new MissingProviderConfig("OPENROUTER_BASE_URL");
  }


  /** 同步出图：直接返回 data URL 列表（GenerationService 按 immediateUrls 处理）。inputImages=参考图（图生图/蒙版重绘） */
  async submitImage(model: string, prompt: string, inputImages?: string[]): Promise<ProviderSubmitResult> {
    this.assertConfigured();
    const referenceImages = (inputImages ?? []).filter((url) => typeof url === "string" && /^https?:\/\//.test(url)).slice(0, 4);
    const isChatRoute = CHAT_ROUTE_MODELS.has(model);
    if (referenceImages.length && !isChatRoute) {
      throw new ProviderError(`openrouter: model ${model} does not support reference images; use a gemini/grok image model`);
    }
    const urls = isChatRoute ? await this.chatGenerate(model, prompt, referenceImages) : await this.imagesGenerate(model, prompt);
    return { remoteId: null, immediateUrls: urls };
  }

  async submit(input: ProviderSubmitInput): Promise<ProviderSubmitResult> {
    if (input.type !== "image") throw new ProviderError("openrouter: only image generation supported");
    const model = typeof input.params.model_code === "string" ? input.params.model_code : "";
    if (!model) throw new ProviderError("openrouter: params.model_code required");
    const inputImages = Array.isArray(input.params.input_images) ? (input.params.input_images as string[]) : undefined;
    return this.submitImage(model, input.prompt, inputImages);
  }

  async poll(_remoteId: string): Promise<ProviderPollResult> {
    throw new ProviderError("openrouter image models are synchronous; poll is not supported");
  }

  private async request(path: string, body: Record<string, unknown>): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? 240_000);
    try {
      const res = await this.fetch(`${this.opts.baseUrl}${path}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.opts.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = (json as { error?: { message?: string } | string }).error;
        const msg = typeof err === "string" ? err : err?.message;
        throw new ProviderError(`openrouter provider ${path} -> HTTP ${res.status}: ${String(msg ?? "").slice(0, 200)}`);
      }
      return json;
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      throw new ProviderError(`openrouter provider ${path} failed: ${(e as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private async chatGenerate(model: string, prompt: string, inputImages: string[] = []): Promise<string[]> {
    const content = inputImages.length
      ? [{ type: "text", text: prompt }, ...inputImages.map((url) => ({ type: "image_url", image_url: { url } }))]
      : prompt;
    const out = await this.request("/chat/completions", {
      model,
      messages: [{ role: "user", content }],
    });
    const message = out?.choices?.[0]?.message ?? {};
    const urls: string[] = [];
    for (const im of message.images ?? []) {
      const u = im?.image_url?.url ?? im?.url;
      if (typeof u === "string" && u.startsWith("data:")) urls.push(u);
    }
    if (!urls.length) throw new ProviderError("openrouter chat route returned no images");
    return urls;
  }

  private async imagesGenerate(model: string, prompt: string): Promise<string[]> {
    const out = await this.request("/images/generations", { model, prompt });
    const urls: string[] = [];
    for (const d of out?.data ?? []) {
      const b64 = d?.b64_json;
      if (typeof b64 === "string" && b64.length > 0) urls.push(`data:image/${d?.image_format ?? "png"};base64,${b64}`);
    }
    if (!urls.length) throw new ProviderError("openrouter images route returned no images");
    return urls;
  }
}
