import { ConfigService } from "../config/config.service";

import { StorageService } from "./storage.service";

// 单元测试不测 aws-sdk 内部：mock 预签名器，只断言我们传给它的命令参数
const signedUrlMock = jest.fn().mockResolvedValue("http://signed.example.com/put");
jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: (...args: unknown[]) => signedUrlMock(...args),
}));

function fakeConfig(over: Partial<Record<string, unknown>> = {}): ConfigService {
  const base = {
    useS3: true,
    s3Endpoint: "http://127.0.0.1:9000",
    s3Region: "us-east-1",
    s3Bucket: "dreamina-local",
    s3AccessKey: "minioadmin",
    s3SecretKey: "minioadmin",
    cdnBaseUrl: "http://127.0.0.1:9000/dreamina-local",
    ...over,
  };
  return base as unknown as ConfigService;
}

describe("StorageService", () => {
  it("presign：key 形如 kind/userId/uuid.ext，url 拼接 CDN", async () => {
    const svc = StorageService.withClient(fakeConfig(), { send: async () => ({}) } as any);
    const out = await svc.presign({ userId: "u-1", filename: "photo.JPG", contentType: "image/jpeg", kind: "image" });
    const cmd = signedUrlMock.mock.calls.at(-1)![1];
    expect(cmd.input.Bucket).toBe("dreamina-local");
    expect(cmd.input.Key).toMatch(/^image\/u-1\/[0-9a-f-]{36}\.jpg$/);
    expect(cmd.input.ContentType).toBe("image/jpeg");
    expect(out.key).toBe(cmd.input.Key);
    expect(out.publicUrl).toBe(`http://127.0.0.1:9000/dreamina-local/${cmd.input.Key}`);
    expect(out.url).toBe("http://signed.example.com/put"); // 签名 PUT 直传地址
    expect(out.expiresIn).toBeGreaterThan(0);
  });

  it("非白名单 contentType → 400", async () => {
    const svc = StorageService.withClient(fakeConfig(), { send: async () => ({}) } as any);
    await expect(
      svc.presign({ userId: "u-1", filename: "x.exe", contentType: "application/x-msdownload", kind: "doc" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("S3 未配置 → 503", async () => {
    const svc = StorageService.withClient(fakeConfig({ useS3: false }), null);
    await expect(
      svc.presign({ userId: "u-1", filename: "a.png", contentType: "image/png", kind: "image" }),
    ).rejects.toMatchObject({ status: 503 });
  });

  it("register 幂等：同 key 二次登记返回同一行", async () => {
    const rows: any[] = [];
    const supabase = {
      from: (table: string) => ({
        upsert: (row: any) => {
          const existing = rows.find((r) => r.storage_key === row.storage_key);
          if (!existing) rows.push(row);
          return {
            select: () => ({
              single: () => Promise.resolve({ data: existing ?? row, error: null }),
            }),
          };
        },
      }),
    };
    const svc = new StorageService(fakeConfig(), {} as any);
    const first = await svc.register(supabase as any, {
      userId: "u-1",
      key: "image/u-1/abc.jpg",
      kind: "image",
      mime: "image/jpeg",
    });
    const second = await svc.register(supabase as any, {
      userId: "u-1",
      key: "image/u-1/abc.jpg",
      kind: "image",
      mime: "image/jpeg",
    });
    expect(rows).toHaveLength(1);
    expect(second.id).toBe(first.id);
  });
});
