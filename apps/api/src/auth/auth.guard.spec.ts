import type { CanActivate, ExecutionContext } from "@nestjs/common";

import { SupabaseJwtGuard } from "./auth.guard";
import type { SupabaseClientFactory } from "./supabase.client";

function runGuard(guard: CanActivate, headers: Record<string, string>) {
  const req = { headers, user: undefined as unknown };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return Promise.resolve(guard.canActivate(ctx)).then((r) => ({ result: r, req }));
}

/** verifier() 返回同步对象（真实 supabase.auth），getUser 为异步 */
const makeFactory = (getUser: (token: string) => Promise<any>) =>
  ({
    configured: true,
    verifier: () => ({ getUser }),
  }) as unknown as SupabaseClientFactory;

describe("SupabaseJwtGuard", () => {
  it("无 Authorization 头 → 401", async () => {
    const guard = new SupabaseJwtGuard(makeFactory(async () => { throw new Error("should not be called"); }));
    await expect(runGuard(guard, {})).rejects.toMatchObject({ status: 401 });
  });

  it("非 Bearer 格式 → 401", async () => {
    const guard = new SupabaseJwtGuard(makeFactory(async () => { throw new Error("should not be called"); }));
    await expect(runGuard(guard, { authorization: "Basic abc" })).rejects.toMatchObject({ status: 401 });
  });

  it("假 token → 401", async () => {
    const guard = new SupabaseJwtGuard(makeFactory(async () => ({ data: { user: null }, error: { message: "invalid JWT" } })));
    await expect(runGuard(guard, { authorization: "Bearer fake.token.here" })).rejects.toMatchObject({ status: 401 });
  });

  it("verifier 抛异常 → 401（不 500）", async () => {
    const guard = new SupabaseJwtGuard(makeFactory(async () => { throw new Error("network down"); }));
    await expect(runGuard(guard, { authorization: "Bearer anything" })).rejects.toMatchObject({ status: 401 });
  });

  it("真 token → 放行且 req.user 注入", async () => {
    const factory = makeFactory(async (token) => {
      expect(token).toBe("good.jwt.token");
      return { data: { user: { id: "u-1", email: "a@b.c" } }, error: null };
    });
    const guard = new SupabaseJwtGuard(factory);
    const { result, req } = await runGuard(guard, { authorization: "Bearer good.jwt.token" });
    expect(result).toBe(true);
    expect(req.user).toEqual({ id: "u-1", email: "a@b.c" });
  });
});
