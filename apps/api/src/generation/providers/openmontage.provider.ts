import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runOpenMontageBridge } from "../openmontage-bridge";
import type { GenerationProvider, ProviderPollResult, ProviderSubmitInput, ProviderSubmitResult } from "./types";
import { MissingProviderConfig, ProviderError } from "./types";

export interface OpenMontageProviderOptions {
  /** 把桥产物（本地文件）上传到对象存储，返回公网 URL */
  uploadFile: (filePath: string, contentType: string) => Promise<string>;
  extraEnv?: NodeJS.ProcessEnv;
  resolveEnv?: () => Promise<NodeJS.ProcessEnv>;
  /** 测试注入 */
  runBridge?: typeof runOpenMontageBridge;
}

/**
 * OpenMontage JSON 桥适配器（D6/D13）：音乐 music_gen、配音 doubao_tts。
 * 未配上游 key → MissingProviderConfig（503，禁 mock）。
 */
export class OpenMontageProvider implements GenerationProvider {
  readonly name = "openmontage";

  constructor(private readonly opts: OpenMontageProviderOptions) {}

  async submit(input: ProviderSubmitInput): Promise<ProviderSubmitResult> {
    const tmp = await mkdtemp(join(tmpdir(), "om-bridge-"));
    const ext = input.type === "music" || input.type === "dubbing" ? "mp3" : "bin";
    const outputPath = join(tmp, `out.${ext}`);
    try {
      const run = this.opts.runBridge ?? runOpenMontageBridge;
      const extra = { ...(this.opts.extraEnv ?? {}), ...((await this.opts.resolveEnv?.()) ?? {}) };
      const clonedVoice = await this.maybeCloneVoice(input, run, extra);
      const tool = clonedVoice ? "elevenlabs_tts" : bridgeTool(input);
      const inputs = this.buildInputs(input, outputPath, clonedVoice);
      const out = await run({ tool, action: "execute", inputs }, { env: extra });
      if (!out.ok) {
        throw this.mapError(out.error ?? "bridge failed", tool);
      }
      const result = out.result ?? {};
      if (result.success === false) {
        throw this.mapError(String(result.error ?? "tool failed"), tool);
      }
      const artifacts = Array.isArray(result.artifacts) ? result.artifacts.filter((x): x is string => typeof x === "string") : [];
      const data = (result.data ?? {}) as Record<string, unknown>;
      const filePath = artifacts[0] ?? (typeof data.output === "string" ? data.output : outputPath);
      const contentType = ext === "mp3" ? "audio/mpeg" : "application/octet-stream";
      const url = await this.opts.uploadFile(filePath, contentType);
      return { remoteId: null, immediateUrls: [url] };
    } finally {
      await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async poll(_remoteId: string): Promise<ProviderPollResult> {
    throw new ProviderError("openmontage tools are synchronous; poll is not supported");
  }

  private async maybeCloneVoice(
    input: ProviderSubmitInput,
    run: typeof runOpenMontageBridge,
    extra: NodeJS.ProcessEnv,
  ): Promise<string | undefined> {
    if (input.type !== "dubbing") return undefined;
    const ref = typeof input.params.reference_audio === "string" ? input.params.reference_audio : undefined;
    if (!ref) return undefined;
    const out = await run({ tool: "elevenlabs_voice_clone", action: "execute", inputs: { audio_url: ref, name: `anygen-${Date.now()}` } }, { env: extra });
    const result = (out.ok ? out.result : undefined) ?? {};
    if (!out.ok || result.success === false) {
      throw this.mapError(String(out.error ?? result.error ?? "clone failed"), "elevenlabs_voice_clone");
    }
    const voiceId = typeof result.voice_id === "string" ? result.voice_id : typeof (result.data as { voice_id?: string } | undefined)?.voice_id === "string" ? (result.data as { voice_id: string }).voice_id : undefined;
    if (!voiceId) throw this.mapError("clone returned no voice_id", "elevenlabs_voice_clone");
    return voiceId;
  }

  private buildInputs(input: ProviderSubmitInput, outputPath: string, clonedVoice?: string): Record<string, unknown> {
    if (input.type === "music") {
      const duration = typeof input.params.duration_seconds === "number" ? input.params.duration_seconds : 30;
      return { prompt: input.prompt, duration_seconds: duration, force_instrumental: true, output_path: outputPath };
    }
    const text =
      (typeof input.params.text === "string" && input.params.text.trim()) ||
      input.prompt;
    const voice =
      clonedVoice ||
      (typeof input.params.voice_id === "string" && input.params.voice_id) ||
      (typeof input.params.voice === "string" && input.params.voice) ||
      process.env.DOUBAO_SPEECH_VOICE_TYPE ||
      "zh_female_vv_uranus_bigtts";
    return { text, voice_id: voice, format: "mp3", output_path: outputPath };
  }

  private mapError(message: string, tool: string): Error {
    if (/no .*api key|not configured|missing/i.test(message)) {
      return new MissingProviderConfig(`${tool}: ${message}`);
    }
    return new ProviderError(`openmontage ${tool}: ${message}`);
  }
}

export function bridgeTool(input: ProviderSubmitInput): string {
  const fromParams = typeof input.params.bridge_tool === "string" ? input.params.bridge_tool : "";
  if (fromParams) return fromParams;
  if (input.type === "music") return "music_gen";
  if (input.type === "dubbing") return "doubao_tts";
  throw new ProviderError(`openmontage: no bridge tool for type ${input.type}`);
}
