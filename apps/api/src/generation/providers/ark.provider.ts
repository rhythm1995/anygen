import type { GenerationProvider, ProviderPollResult, ProviderSubmitInput, ProviderSubmitResult } from "./types";
import { MissingProviderConfig, ProviderError } from "./types";

export interface ArkProviderOptions {
  baseUrl: string;
  apiKey: string;
  imageModel: string;
  videoModel: string;
  /** 注入点：测试用可替换的 fetch */
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 120_000;

function urlList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((u): u is string => typeof u === "string" && /^https?:\/\//.test(u));
}

/**
 * 火山方舟 Ark v3 适配器。
 * - 视频：异步任务 API /contents/generations/tasks（submit → poll）
 * - 图片：同步 API /images/generations（submit 即返回 URL）
 */
export class ArkProvider implements GenerationProvider {
  readonly name = "ark";
  private readonly fetch: typeof fetch;

  constructor(private readonly opts: ArkProviderOptions) {
    this.fetch = opts.fetchImpl ?? globalThis.fetch;
  }

  withCredentials(creds: { apiKey: string; baseUrl?: string }): ArkProvider {
    return new ArkProvider({
      ...this.opts,
      apiKey: creds.apiKey,
      baseUrl: creds.baseUrl || this.opts.baseUrl,
    });
  }

  private assertConfigured(): void {
    if (!this.opts.apiKey) throw new MissingProviderConfig("ARK_API_KEY");
    if (!this.opts.baseUrl) throw new MissingProviderConfig("ARK_BASE_URL");
  }

  private async request(path: string, init: RequestInit): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const res = await this.fetch(`${this.opts.baseUrl}${path}`, {
        ...init,
        headers: {
          authorization: `Bearer ${this.opts.apiKey}`,
          "content-type": "application/json",
          ...(init.headers ?? {}),
        },
        signal: controller.signal,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new ProviderError(`ark provider ${path} -> HTTP ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
      }
      return body;
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      throw new ProviderError(`ark provider ${path} failed: ${(e as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  async submit(input: ProviderSubmitInput): Promise<ProviderSubmitResult> {
    this.assertConfigured();
    if (input.type === "image") {
      const size = typeof input.params.size === "string" ? input.params.size : "1024x1024";
      const body: Record<string, unknown> = {
        model: this.opts.imageModel,
        prompt: input.prompt,
        size,
        response_format: "url",
      };
      const refs = urlList(input.params.input_images);
      if (refs.length === 1) body.image = refs[0];
      else if (refs.length > 1) body.image = refs;
      if (typeof input.params.watermark === "boolean") body.watermark = input.params.watermark;
      const out = await this.request("/images/generations", { method: "POST", body: JSON.stringify(body) });
      const urls: string[] = (out?.data ?? []).map((d: { url?: string }) => d?.url).filter((u: unknown): u is string => typeof u === "string");
      if (!urls.length) throw new ProviderError("ark images/generations returned no urls");
      return { remoteId: null, immediateUrls: urls };
    }

    // video / digital_human / motion_mimic → Seedance 异步任务（D13：参考素材按官方 content.role 挂载）
    const body: Record<string, unknown> = {
      model: this.opts.videoModel,
      content: this.buildVideoContent(input.prompt, input.params, input.type),
    };
    const out = await this.request("/contents/generations/tasks", { method: "POST", body: JSON.stringify(body) });
    if (!out?.id) throw new ProviderError("ark tasks returned no id");
    return { remoteId: String(out.id) };
  }

  private buildVideoText(prompt: string, params: Record<string, unknown>): string {
    let text = prompt;
    if (typeof params.ratio === "string") text += ` --ratio ${params.ratio}`;
    const duration = typeof params.duration_seconds === "number" ? params.duration_seconds : params.duration;
    if (typeof duration === "number") text += ` --duration ${duration}`;
    if (typeof params.resolution === "string") text += ` --resolution ${params.resolution}`;
    return text;
  }

  /** Ark Seedance content[]：text + first_frame/last_frame/reference_image/reference_video/reference_audio */
  private buildVideoContent(prompt: string, params: Record<string, unknown>, type: string): Record<string, unknown>[] {
    const content: Record<string, unknown>[] = [{ type: "text", text: this.buildVideoText(prompt, params) }];
    const mode = typeof params.reference_mode === "string" ? params.reference_mode : "";
    const images = urlList(params.input_images);
    const videos = urlList(params.input_videos);
    const audios = urlList(params.input_audios);
    const first = typeof params.first_frame_url === "string" ? params.first_frame_url : images[0];
    const last = typeof params.last_frame_url === "string" ? params.last_frame_url : images[1];
    const refVideo =
      typeof params.reference_video_url === "string"
        ? params.reference_video_url
        : typeof params.reference_video === "string"
          ? params.reference_video
          : videos[0];

    if (type === "digital_human" && images[0]) {
      content.push({ type: "image_url", image_url: { url: images[0] }, role: "first_frame" });
      for (const a of audios) content.push({ type: "audio_url", audio_url: { url: a }, role: "reference_audio" });
      return content;
    }
    if (type === "motion_mimic" && refVideo) {
      content.push({ type: "video_url", video_url: { url: refVideo }, role: "reference_video" });
      for (const img of images) content.push({ type: "image_url", image_url: { url: img }, role: "reference_image" });
      return content;
    }

    if (mode === "first_end_frame") {
      if (first) content.push({ type: "image_url", image_url: { url: first }, role: "first_frame" });
      if (last) content.push({ type: "image_url", image_url: { url: last }, role: "last_frame" });
      return content;
    }
    if (mode === "extend" && refVideo) {
      content.push({ type: "video_url", video_url: { url: refVideo }, role: "reference_video" });
    }
    for (const img of images) {
      if (img === first && mode === "first_end_frame") continue;
      content.push({ type: "image_url", image_url: { url: img }, role: "reference_image" });
    }
    for (const v of videos) {
      if (v === refVideo && mode === "extend") continue;
      content.push({ type: "video_url", video_url: { url: v }, role: "reference_video" });
    }
    for (const a of audios) content.push({ type: "audio_url", audio_url: { url: a }, role: "reference_audio" });
    return content;
  }

  async poll(remoteId: string): Promise<ProviderPollResult> {
    this.assertConfigured();
    const out = await this.request(`/contents/generations/tasks/${encodeURIComponent(remoteId)}`, { method: "GET" });
    const status = String(out?.status ?? "");
    if (status === "succeeded") {
      const urls: string[] = [];
      const content = out?.content ?? {};
      if (typeof content.video_url === "string") urls.push(content.video_url);
      for (const item of content.video_urls ?? []) {
        if (typeof item?.url === "string") urls.push(item.url);
      }
      if (!urls.length) return { status: "failed", error: "succeeded but no video url in response" };
      return { status: "succeeded", urls };
    }
    if (status === "failed" || status === "cancelled") {
      const msg = out?.error?.message ?? out?.error ?? status;
      return { status: "failed", error: String(msg) };
    }
    if (status === "running") return { status: "running" };
    return { status: "queued" };
  }
}
