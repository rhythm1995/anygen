import { createServer, type IncomingMessage, type Server } from "node:http";

import { OpenRouterProvider } from "./openrouter.provider";

// 与 ark.provider.spec 同款：本地 http server 打桩（nock 拦不到 undici fetch）
interface RecordedRequest {
  url?: string;
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
      const recorded: RecordedRequest = { url: req.url, body: raw ? JSON.parse(raw) : null };
      requests.push(recorded);
      responder(recorded, res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

afterAll(async () => {
  server.closeAllConnections?.();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  requests = [];
  responder = () => {};
});

const json = (res: import("node:http").ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

const provider = () => new OpenRouterProvider({ baseUrl, apiKey: "test-key" });

describe("OpenRouterProvider 参考图（图生图）", () => {
  it("chat 路由模型带 input_images → 请求体为多模态 content（text + image_url）", async () => {
    responder = (_req, res) =>
      json(res, 200, {
        choices: [{ message: { images: [{ image_url: { url: "data:image/png;base64,AAA" } }] } }],
      });
    const result = await provider().submitImage("google/gemini-3.1-flash-lite-image", "把蒙版区域改成夜景", [
      "https://minio.local/pub/ref.png",
    ]);
    expect(result.immediateUrls).toEqual(["data:image/png;base64,AAA"]);
    expect(requests[0]!.url).toBe("/chat/completions");
    const content = requests[0]!.body.messages[0].content;
    expect(Array.isArray(content)).toBe(true);
    expect(content).toEqual(
      expect.arrayContaining([
        { type: "text", text: "把蒙版区域改成夜景" },
        { type: "image_url", image_url: { url: "https://minio.local/pub/ref.png" } },
      ]),
    );
  });

  it("多张参考图按顺序全部进入 content", async () => {
    responder = (_req, res) =>
      json(res, 200, { choices: [{ message: { images: [{ image_url: { url: "data:image/png;base64,BBB" } }] } }] });
    await provider().submitImage("google/gemini-3.1-flash-image", "p", ["https://a/1.png", "https://a/2.png"]);
    const content = requests[0]!.body.messages[0].content as Array<{ type: string }>;
    expect(content.filter((part) => part.type === "image_url")).toHaveLength(2);
  });

  it("images 路由模型（如 seedream）带参考图 → 如实报错不支持", async () => {
    await expect(
      provider().submitImage("bytedance/seedream-4", "p", ["https://a/1.png"]),
    ).rejects.toThrow(/does not support reference images/i);
    expect(requests).toHaveLength(0);
  });

  it("submit() 从 params.input_images 透传参考图", async () => {
    responder = (_req, res) =>
      json(res, 200, { choices: [{ message: { images: [{ image_url: { url: "data:image/png;base64,CCC" } }] } }] });
    const result = await provider().submit({
      type: "image",
      prompt: "edit",
      params: { model_code: "google/gemini-3.1-flash-lite-image", input_images: ["https://a/1.png"] },
    });
    expect(result.immediateUrls).toEqual(["data:image/png;base64,CCC"]);
    expect(Array.isArray(requests[0]!.body.messages[0].content)).toBe(true);
  });
});
