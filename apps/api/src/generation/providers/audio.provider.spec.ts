import { AudioProvider } from "./audio.provider";
import { MissingProviderConfig, ProviderError } from "./types";

const jsonRes = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const binRes = (body: string, status = 200) =>
  new Response(Buffer.from(body), { status, headers: { "content-type": "audio/mpeg" } });

describe("AudioProvider", () => {
  it("音乐：ElevenLabs /v1/music → 上传产物 URL", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const uploaded: Buffer[] = [];
    const provider = new AudioProvider({
      keys: { elevenLabs: "el-key" },
      uploadAudio: async (body) => {
        uploaded.push(body);
        return "https://cdn.example.com/m.mp3";
      },
      fetchImpl: async (input, init) => {
        const url = String(input);
        const raw = typeof init?.body === "string" ? JSON.parse(init.body) : null;
        calls.push({ url, body: raw });
        expect((init?.headers as Record<string, string>)["xi-api-key"]).toBe("el-key");
        return binRes("ID3fake");
      },
    });
    const out = await provider.submit({ type: "music", prompt: "lofi beat", params: { duration_seconds: 12 } });
    expect(out.immediateUrls).toEqual(["https://cdn.example.com/m.mp3"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.elevenlabs.io/v1/music");
    expect(calls[0]!.body).toEqual({ prompt: "lofi beat", music_length_ms: 12000, force_instrumental: true });
    expect(uploaded[0]!.toString()).toBe("ID3fake");
  });

  it("音乐缺 key → MissingProviderConfig（不发请求）", async () => {
    let called = false;
    const provider = new AudioProvider({
      uploadAudio: async () => "https://x",
      fetchImpl: async () => {
        called = true;
        return binRes("x");
      },
    });
    await expect(provider.submit({ type: "music", prompt: "x", params: { duration_seconds: 10 } })).rejects.toBeInstanceOf(
      MissingProviderConfig,
    );
    expect(called).toBe(false);
  });

  it("配音克隆：先 /v1/voices/add 再 elevenlabs tts", async () => {
    const urls: string[] = [];
    const provider = new AudioProvider({
      keys: { elevenLabs: "el-key" },
      uploadAudio: async () => "https://cdn.example.com/v.mp3",
      fetchImpl: async (input, init) => {
        const url = String(input);
        urls.push(url);
        if (url === "https://cdn.example.com/ref.wav") return binRes("WAVDATA");
        if (url === "https://api.elevenlabs.io/v1/voices/add") {
          expect(init?.body).toBeInstanceOf(FormData);
          return jsonRes(200, { voice_id: "vcl_1" });
        }
        if (url.includes("/v1/text-to-speech/vcl_1")) {
          const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
          expect(body.text).toBe("你好");
          return binRes("ID3");
        }
        throw new Error(`unexpected ${url}`);
      },
    });
    await provider.submit({ type: "dubbing", prompt: "你好", params: { reference_audio: "https://cdn.example.com/ref.wav" } });
    expect(urls).toEqual([
      "https://cdn.example.com/ref.wav",
      "https://api.elevenlabs.io/v1/voices/add",
      "https://api.elevenlabs.io/v1/text-to-speech/vcl_1?output_format=mp3_44100_128",
    ]);
  });

  it("配音：豆包 submit + query + 下载", async () => {
    const urls: string[] = [];
    const provider = new AudioProvider({
      keys: { doubaoSpeech: "db-key", doubaoVoice: "zh_female_test" },
      uploadAudio: async () => "https://cdn.example.com/d.mp3",
      fetchImpl: async (input, init) => {
        const url = String(input);
        urls.push(url);
        if (url.endsWith("/api/v3/tts/submit")) {
          const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
          expect(body.req_params.speaker).toBe("zh_female_test");
          expect(body.req_params.text).toBe("你好");
          expect((init?.headers as Record<string, string>)["X-Api-Key"]).toBe("db-key");
          return jsonRes(200, { code: 20000000, data: { task_id: "task-1" } });
        }
        if (url.endsWith("/api/v3/tts/query")) {
          return jsonRes(200, { code: 20000000, data: { task_status: 2, audio_url: "https://cdn.volc.test/a.mp3" } });
        }
        if (url === "https://cdn.volc.test/a.mp3") return binRes("MP3DATA");
        throw new Error(`unexpected ${url}`);
      },
    });
    const out = await provider.submit({ type: "dubbing", prompt: "你好", params: {} });
    expect(out.immediateUrls).toEqual(["https://cdn.example.com/d.mp3"]);
    expect(urls[0]).toContain("/api/v3/tts/submit");
    expect(urls[1]).toContain("/api/v3/tts/query");
    expect(urls[2]).toBe("https://cdn.volc.test/a.mp3");
  });

  it("配音缺豆包 key → MissingProviderConfig", async () => {
    const provider = new AudioProvider({
      uploadAudio: async () => "https://x",
      fetchImpl: async () => binRes("x"),
    });
    await expect(provider.submit({ type: "dubbing", prompt: "你好", params: { voice: "female_warm" } })).rejects.toBeInstanceOf(
      MissingProviderConfig,
    );
  });

  it("ElevenLabs HTTP 失败 → ProviderError", async () => {
    const provider = new AudioProvider({
      keys: { elevenLabs: "el-key" },
      uploadAudio: async () => "https://x",
      fetchImpl: async () => jsonRes(401, { detail: "invalid api key" }),
    });
    await expect(provider.submit({ type: "music", prompt: "x", params: { duration_seconds: 10 } })).rejects.toBeInstanceOf(ProviderError);
  });
});
