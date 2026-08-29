import { createServer, type IncomingMessage, type Server } from "node:http";

import { ArkProvider } from "./ark.provider";

// nock 拦截不到 undici fetch，用本地 http server 打桩（零依赖、行为真实）
interface RecordedRequest {
  method?: string;
  url?: string;
  headers: IncomingMessage["headers"];
  body: any;
}

let server: Server;
let baseUrl: string;
let requests: RecordedRequest[];
let responder: (req: RecordedRequest, res: import("node:http").ServerResponse) => void;

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const recorded: RecordedRequest = {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: raw ? JSON.parse(raw) : null,
      };
      requests.push(recorded);
      responder(recorded, res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  baseUrl = `http://127.0.0.1:${port}/api/v3`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  requests = [];
  responder = () => {};
});
afterEach(() => {
  responder = () => {};
});

const json = (res: import("node:http").ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

const provider = () =>
  new ArkProvider({
    baseUrl,
    apiKey: "test-key",
    imageModel: "doubao-seedream-test",
    videoModel: "doubao-seedance-test",
  });

describe("ArkProvider.submit", () => {
  it("文生视频：POST tasks 接口，带鉴权头与模型 id，返回 remote id", async () => {
    responder = (_req, res) => json(res, 200, { id: "cgt-20260830-123", status: "queued" });

    const result = await provider().submit({ type: "video", prompt: "a cat", params: { ratio: "16:9", duration: 5 } });
    expect(result.remoteId).toBe("cgt-20260830-123");
    expect(requests).toHaveLength(1);
    expect(requests[0]!.method).toBe("POST");
    expect(requests[0]!.url).toBe("/api/v3/contents/generations/tasks");
    expect(requests[0]!.headers.authorization).toBe("Bearer test-key");
    expect(requests[0]!.body.model).toBe("doubao-seedance-test");
    expect(JSON.stringify(requests[0]!.body.content)).toContain("a cat");
    expect(JSON.stringify(requests[0]!.body.content)).toContain("--ratio 16:9");
  });

  it("文生图：同步接口立即返回产物 URL（submit 即完成）", async () => {
    responder = (_req, res) => json(res, 200, { data: [{ url: "https://img.example.com/out-0.jpg" }] });

    const result = await provider().submit({ type: "image", prompt: "a dog", params: { size: "1024x1024" } });
    expect(result.immediateUrls).toEqual(["https://img.example.com/out-0.jpg"]);
    expect(requests[0]!.url).toBe("/api/v3/images/generations");
    expect(requests[0]!.body.model).toBe("doubao-seedream-test");
    expect(requests[0]!.body.prompt).toBe("a dog");
    expect(requests[0]!.body.size).toBe("1024x1024");
  });

  it("5xx → ProviderError", async () => {
    responder = (_req, res) => json(res, 500, { error: "boom" });
    await expect(provider().submit({ type: "video", prompt: "x", params: {} })).rejects.toThrow(/provider/i);
  });

  it("缺 API key → MissingProviderConfig（不发请求）", async () => {
    const p = new ArkProvider({ baseUrl, apiKey: "", imageModel: "i", videoModel: "v" });
    await expect(p.submit({ type: "image", prompt: "x", params: {} })).rejects.toThrow(/config/i);
    expect(requests).toHaveLength(0);
  });
});

describe("ArkProvider.poll", () => {
  it("running 中间态", async () => {
    responder = (_req, res) => json(res, 200, { id: "cgt-1", status: "running" });
    const result = await provider().poll("cgt-1");
    expect(result.status).toBe("running");
    expect(requests[0]!.url).toBe("/api/v3/contents/generations/tasks/cgt-1");
  });

  it("成功态解析产物 URL 列表", async () => {
    responder = (_req, res) => json(res, 200, { id: "cgt-2", status: "succeeded", content: { video_url: "https://cdn.example.com/v.mp4" } });
    const result = await provider().poll("cgt-2");
    expect(result.status).toBe("succeeded");
    expect(result.urls).toEqual(["https://cdn.example.com/v.mp4"]);
  });

  it("失败态带错误信息", async () => {
    responder = (_req, res) => json(res, 200, { id: "cgt-3", status: "failed", error: { message: "content policy" } });
    const result = await provider().poll("cgt-3");
    expect(result.status).toBe("failed");
    expect(result.error).toContain("content policy");
  });
});
