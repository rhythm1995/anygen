import { randomUUID } from "node:crypto";

import type { GenerationProvider, ProviderPollResult, ProviderSubmitInput, ProviderSubmitResult } from "./types";
import { MissingProviderConfig, ProviderError } from "./types";

export interface AudioKeys {
  elevenLabs?: string;
  doubaoSpeech?: string;
  doubaoVoice?: string;
}

export interface AudioProviderOptions {
  uploadAudio: (body: Buffer, contentType: string) => Promise<string>;
  keys?: AudioKeys;
  resolveKeys?: () => Promise<AudioKeys>;
  fetchImpl?: typeof fetch;
  elevenLabsBaseUrl?: string;
  doubaoBaseUrl?: string;
  sleep?: (ms: number) => Promise<void>;
}

const ELEVEN_DEFAULT = "https://api.elevenlabs.io";
const DOUBAO_DEFAULT = "https://openspeech.bytedance.com";
const DOUBAO_RESOURCE = "seed-tts-2.0";
const DOUBAO_VOICE_FALLBACK = "zh_female_vv_uranus_bigtts";
const DOUBAO_OK = 20000000;

/**
 * 音乐 / 配音 HTTP 适配器（CONCLUSIONS D6 2026-09-01）：
 * 全部在 apps/api 直连上游，不 spawn vendor、不 import vendor。
 * 契约对照 vendor/openmontage tools/audio/{music_gen,doubao_tts,elevenlabs_tts}。
 */
export class AudioProvider implements GenerationProvider {
  readonly name = "audio";
  private readonly fetch: typeof fetch;
  private readonly elevenBase: string;
  private readonly doubaoBase: string;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly opts: AudioProviderOptions) {
    this.fetch = opts.fetchImpl ?? globalThis.fetch;
    this.elevenBase = (opts.elevenLabsBaseUrl ?? ELEVEN_DEFAULT).replace(/\/$/, "");
    this.doubaoBase = (opts.doubaoBaseUrl ?? DOUBAO_DEFAULT).replace(/\/$/, "");
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async submit(input: ProviderSubmitInput): Promise<ProviderSubmitResult> {
    const keys = await this.resolveKeys();
    if (input.type === "music") {
      const bytes = await this.elevenLabsMusic(input, keys);
      const url = await this.opts.uploadAudio(bytes, "audio/mpeg");
      return { remoteId: null, immediateUrls: [url] };
    }
    if (input.type === "dubbing") {
      const bytes = await this.dubbing(input, keys);
      const url = await this.opts.uploadAudio(bytes, "audio/mpeg");
      return { remoteId: null, immediateUrls: [url] };
    }
    throw new ProviderError(`audio: unsupported type ${input.type}`);
  }

  async poll(_remoteId: string): Promise<ProviderPollResult> {
    throw new ProviderError("audio tools are synchronous; poll is not supported");
  }

  private async resolveKeys(): Promise<AudioKeys> {
    const extra = (await this.opts.resolveKeys?.()) ?? {};
    return { ...(this.opts.keys ?? {}), ...extra };
  }

  private speechText(input: ProviderSubmitInput): string {
    const fromParams = typeof input.params.text === "string" ? input.params.text.trim() : "";
    return fromParams || input.prompt;
  }

  private async elevenLabsMusic(input: ProviderSubmitInput, keys: AudioKeys): Promise<Buffer> {
    if (!keys.elevenLabs) throw new MissingProviderConfig("ELEVENLABS_API_KEY");
    const duration = typeof input.params.duration_seconds === "number" ? input.params.duration_seconds : 30;
    const res = await this.request(`${this.elevenBase}/v1/music`, {
      method: "POST",
      headers: {
        "xi-api-key": keys.elevenLabs,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        prompt: input.prompt,
        music_length_ms: Math.round(duration * 1000),
        force_instrumental: input.params.force_instrumental !== false,
      }),
    }, 180_000);
    return this.readAudioOrThrow(res, "elevenlabs music");
  }

  private async dubbing(input: ProviderSubmitInput, keys: AudioKeys): Promise<Buffer> {
    const text = this.speechText(input);
    const ref = typeof input.params.reference_audio === "string" ? input.params.reference_audio : undefined;
    if (ref) {
      if (!keys.elevenLabs) throw new MissingProviderConfig("ELEVENLABS_API_KEY");
      const voiceId = await this.cloneVoice(keys.elevenLabs, ref);
      return this.elevenLabsTts(keys.elevenLabs, text, voiceId);
    }
    if (!keys.doubaoSpeech) throw new MissingProviderConfig("DOUBAO_SPEECH_API_KEY");
    const voice =
      (typeof input.params.voice_id === "string" && input.params.voice_id) ||
      (typeof input.params.voice === "string" && input.params.voice) ||
      keys.doubaoVoice ||
      DOUBAO_VOICE_FALLBACK;
    return this.doubaoTts(keys.doubaoSpeech, text, voice);
  }

  private async cloneVoice(apiKey: string, audioUrl: string): Promise<string> {
    const src = await this.request(audioUrl, { method: "GET" }, 60_000);
    const audio = Buffer.from(await src.arrayBuffer());
    if (!src.ok || audio.length === 0) {
      throw new ProviderError(`elevenlabs clone: failed to fetch reference audio HTTP ${src.status}`);
    }
    const form = new FormData();
    form.set("name", `anygen-${Date.now()}`.slice(0, 64));
    form.set("files", new Blob([new Uint8Array(audio)], { type: "application/octet-stream" }), filenameFromUrl(audioUrl));
    const res = await this.request(`${this.elevenBase}/v1/voices/add`, {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: form,
    }, 120_000);
    const body = await readJson(res);
    if (!res.ok) throw new ProviderError(`elevenlabs clone HTTP ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
    const voiceId = typeof body.voice_id === "string" ? body.voice_id : undefined;
    if (!voiceId) throw new ProviderError("elevenlabs clone returned no voice_id");
    return voiceId;
  }

  private async elevenLabsTts(apiKey: string, text: string, voiceId: string): Promise<Buffer> {
    const res = await this.request(
      `${this.elevenBase}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "content-type": "application/json",
          accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0,
            speed: 1,
            use_speaker_boost: true,
          },
        }),
      },
      120_000,
    );
    return this.readAudioOrThrow(res, "elevenlabs tts");
  }

  private async doubaoTts(apiKey: string, text: string, voice: string): Promise<Buffer> {
    const reqId = randomUUID();
    const headers = {
      "X-Api-Key": apiKey,
      "X-Api-Resource-Id": DOUBAO_RESOURCE,
      "X-Api-Request-Id": reqId,
      "content-type": "application/json",
      "X-Control-Require-Usage-Tokens-Return": "true",
    };
    const submit = await this.request(`${this.doubaoBase}/api/v3/tts/submit`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        user: { uid: "anygen" },
        unique_id: reqId,
        req_params: {
          text,
          speaker: voice,
          audio_params: { format: "mp3", sample_rate: 24000, speech_rate: 0, enable_timestamp: true },
          additions: JSON.stringify({ disable_markdown_filter: false }),
        },
      }),
    }, 60_000);
    const submitted = await readJson(submit);
    this.assertDoubaoOk(submit.status, submitted, "doubao submit");
    const taskId = nestedString(submitted, ["data", "task_id"]);
    if (!taskId) throw new ProviderError("doubao submit succeeded but did not return data.task_id");

    const queryData = await this.pollDoubao(apiKey, taskId);
    const audioUrl = nestedString(queryData, ["data", "audio_url"]);
    if (!audioUrl) throw new ProviderError("doubao task completed but did not return data.audio_url");
    const audioRes = await this.request(audioUrl, { method: "GET" }, 120_000);
    return this.readAudioOrThrow(audioRes, "doubao audio");
  }

  private async pollDoubao(apiKey: string, taskId: string): Promise<Record<string, unknown>> {
    const deadline = Date.now() + 300_000;
    let first = true;
    while (Date.now() < deadline) {
      if (!first) await this.sleep(2000);
      first = false;
      const res = await this.request(`${this.doubaoBase}/api/v3/tts/query`, {
        method: "POST",
        headers: {
          "X-Api-Key": apiKey,
          "X-Api-Resource-Id": DOUBAO_RESOURCE,
          "X-Api-Request-Id": randomUUID(),
          "content-type": "application/json",
          "X-Control-Require-Usage-Tokens-Return": "true",
        },
        body: JSON.stringify({ task_id: taskId }),
      }, 60_000);
      const data = await readJson(res);
      this.assertDoubaoOk(res.status, data, "doubao query");
      const status = nestedNumber(data, ["data", "task_status"]);
      if (status === 2) return data;
      if (status === 3) {
        throw new ProviderError(`doubao task failed: ${typeof data.message === "string" ? data.message : "unknown error"}`);
      }
    }
    throw new ProviderError("doubao task did not finish within 300 seconds");
  }

  private assertDoubaoOk(httpStatus: number, payload: Record<string, unknown>, label: string): void {
    if (httpStatus < 400 && payload.code === DOUBAO_OK) return;
    const message = typeof payload.message === "string" ? payload.message : "unknown error";
    throw new ProviderError(`${label} HTTP ${httpStatus}, code ${String(payload.code)}: ${message}`);
  }

  private async readAudioOrThrow(res: Response, label: string): Promise<Buffer> {
    const buf = Buffer.from(await res.arrayBuffer());
    if (!res.ok) {
      const text = buf.toString("utf8").slice(0, 300);
      throw new ProviderError(`${label} HTTP ${res.status}: ${text}`);
    }
    if (buf.length === 0) throw new ProviderError(`${label}: empty audio body`);
    return buf;
  }

  private async request(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await this.fetch(url, { ...init, signal: controller.signal });
    } catch (e) {
      if (e instanceof ProviderError || e instanceof MissingProviderConfig) throw e;
      if ((e as Error).name === "AbortError") throw new ProviderError(`${url} timeout after ${timeoutMs}ms`);
      throw new ProviderError(`${url} failed: ${(e as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }
}

function filenameFromUrl(url: string): string {
  try {
    const base = new URL(url).pathname.split("/").pop() || "clone.mp3";
    return base.includes(".") ? base : `${base}.mp3`;
  } catch {
    return "clone.mp3";
  }
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new ProviderError(`Non-JSON response HTTP ${res.status}: ${text.slice(0, 240)}`);
  }
}

function nestedString(obj: Record<string, unknown>, path: string[]): string | undefined {
  let cur: unknown = obj;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return typeof cur === "string" ? cur : undefined;
}

function nestedNumber(obj: Record<string, unknown>, path: string[]): number | undefined {
  let cur: unknown = obj;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return typeof cur === "number" ? cur : undefined;
}

