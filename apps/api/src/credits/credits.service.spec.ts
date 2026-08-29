/**
 * TDD #3 积分账本 —— 集成测试（真实本地 Supabase Postgres）。
 * 覆盖 docs/TESTING.md：原子扣减 / 不足拒绝 / 并发守卫 / 退款幂等 / 一致性。
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { CreditsService } from "./credits.service";

config({ path: resolve(__dirname, "../../.env.local"), override: true });

const URL = process.env.SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function createTestUser(supabase: SupabaseClient): Promise<string> {
  const email = `test-${randomUUID()}@dreamina.local`;
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: randomUUID(),
    email_confirm: true,
  });
  expect(error).toBeNull();
  return data!.user!.id;
}

describe("CreditsService（真实 DB）", () => {
  let supabase: SupabaseClient;
  let service: CreditsService;
  let userId: string;

  beforeAll(() => {
    supabase = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    service = new CreditsService({ serviceClient: supabase } as never);
  });

  beforeEach(async () => {
    userId = await createTestUser(supabase);
  });

  it("grant → balance 生效且 ledger 有记录", async () => {
    const balance = await service.grant(userId, 100, "signup_bonus");
    expect(balance).toBe(100);
    const ledger = await service.ledger(userId);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ delta: 100, reason: "signup_bonus", balanceAfter: 100 });
  });

  it("tryDebit 成功：余额减少 + balance_after 一致", async () => {
    await service.grant(userId, 100);
    const ok = await service.tryDebit(userId, 30);
    expect(ok).toBe(true);
    expect(await service.balance(userId)).toBe(70);
    const ledger = await service.ledger(userId);
    const debit = ledger.find((l) => l.reason === "generation_consume");
    expect(debit).toMatchObject({ delta: -30, balanceAfter: 70 });
  });

  it("余额不足：tryDebit 返回 false，ledger 无新记录", async () => {
    await service.grant(userId, 10);
    const ok = await service.tryDebit(userId, 30);
    expect(ok).toBe(false);
    expect(await service.balance(userId)).toBe(10);
    expect(await service.ledger(userId)).toHaveLength(1);
  });

  it("并发扣减：只有余额足够的部分成功（原子守卫）", async () => {
    await service.grant(userId, 50);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => service.tryDebit(userId, 20)),
    );
    expect(results.filter(Boolean)).toHaveLength(2); // 50 只够两次 20
    expect(await service.balance(userId)).toBe(10);
    const sum = (await service.ledger(userId)).reduce((acc, l) => acc + l.delta, 0);
    expect(sum).toBe(await service.balance(userId)); // 流水与余额一致
  });

  it("refund 按任务幂等：第二次退款拒绝", async () => {
    await service.grant(userId, 100);
    const taskId = await createTaskRow();
    expect(await service.tryDebit(userId, 40, taskId)).toBe(true);
    expect(await service.refund(userId, 40, taskId)).toBe(true);
    expect(await service.balance(userId)).toBe(100);
    expect(await service.refund(userId, 40, taskId)).toBe(false);
    expect(await service.balance(userId)).toBe(100); // 不重复退
  });

  it("非法金额抛错", async () => {
    await service.grant(userId, 10);
    await expect(service.tryDebit(userId, 0)).rejects.toThrow();
    const taskId = await createTaskRow();
    await expect(service.refund(userId, -5, taskId)).rejects.toThrow();
  });

  /** generation_tasks 有 FK，退款测试需要真实任务行 */
  async function createTaskRow(): Promise<string> {
    const taskId = randomUUID();
    const { error } = await supabase.from("generation_tasks").insert({
      id: taskId,
      user_id: userId,
      type: "image",
      prompt: "test",
      cost: 40,
    });
    expect(error).toBeNull();
    return taskId;
  }
});
