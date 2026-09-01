import { writeFile } from "node:fs/promises";

import { OpenMontageProvider } from "./openmontage.provider";
import { MissingProviderConfig } from "./types";

describe("OpenMontageProvider", () => {
  it("音乐：桥成功 → 上传产物 URL", async () => {
    const uploaded: string[] = [];
    const provider = new OpenMontageProvider({
      uploadFile: async (filePath) => {
        uploaded.push(filePath);
        return "https://cdn.example.com/m.mp3";
      },
      runBridge: async (req) => {
        expect(req.tool).toBe("music_gen");
        const path = String((req.inputs as { output_path: string }).output_path);
        await writeFile(path, Buffer.from("ID3fake"));
        return { ok: true, result: { success: true, artifacts: [path], data: { output: path } } };
      },
    });
    const out = await provider.submit({ type: "music", prompt: "lofi beat", params: { duration_seconds: 12 } });
    expect(out.immediateUrls).toEqual(["https://cdn.example.com/m.mp3"]);
    expect(uploaded).toHaveLength(1);
  });

  it("配音克隆：先 clone 再 elevenlabs_tts", async () => {
    const tools: string[] = [];
    const provider = new OpenMontageProvider({
      uploadFile: async () => "https://cdn.example.com/v.mp3",
      runBridge: async (req) => {
        tools.push(req.tool);
        if (req.tool === "elevenlabs_voice_clone") return { ok: true, result: { success: true, voice_id: "vcl_1" } };
        const path = String((req.inputs as { output_path: string }).output_path);
        const { writeFile } = await import("node:fs/promises");
        await writeFile(path, Buffer.from("ID3"));
        expect((req.inputs as { voice_id: string }).voice_id).toBe("vcl_1");
        return { ok: true, result: { success: true, artifacts: [path] } };
      },
    });
    await provider.submit({ type: "dubbing", prompt: "你好", params: { reference_audio: "https://cdn.example.com/ref.wav" } });
    expect(tools).toEqual(["elevenlabs_voice_clone", "elevenlabs_tts"]);
  });

  it("配音：桥报缺 key → MissingProviderConfig", async () => {
    const provider = new OpenMontageProvider({
      uploadFile: async () => "https://x",
      runBridge: async () => ({ ok: true, result: { success: false, error: "No Doubao Speech API key." } }),
    });
    await expect(provider.submit({ type: "dubbing", prompt: "你好", params: { voice: "female_warm" } })).rejects.toBeInstanceOf(
      MissingProviderConfig,
    );
  });

  it("桥进程失败 → ProviderError", async () => {
    const provider = new OpenMontageProvider({
      uploadFile: async () => "https://x",
      runBridge: async () => ({ ok: false, error: "python missing" }),
    });
    await expect(provider.submit({ type: "music", prompt: "x", params: { duration_seconds: 10 } })).rejects.toThrow(/python missing/);
  });
});
