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

describe("CreditsService（美分账本，真实 DB）", () => {
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

  afterEach(async () => {
    await supabase.auth.admin.deleteUser(userId);
  });

  it("initial grant → balance 与 ledger 一致", async () => {
    const balance = await service.grantInitial(userId, 500); // $5.00
    expect(balance).toBe(500);
    const entries = await service.ledger(userId);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ cents: 500, reason: "initial_grant", balanceAfterCents: 500 });
  });

  it("tryDebit 成功：余额减少且 balance_after_cents 一致", async () => {
    await service.grantInitial(userId, 500);
    expect(await service.tryDebit(userId, 70)).toBe(true);
    expect(await service.balance(userId)).toBe(430);
    const entries = await service.ledger(userId);
    expect(entries.find((e) => e.reason === "generation")).toMatchObject({ cents: -70, balanceAfterCents: 430 });
  });

  it("余额不足：tryDebit 返回 false，无新流水", async () => {
    await service.grantInitial(userId, 10);
    expect(await service.tryDebit(userId, 70)).toBe(false);
    expect(await service.balance(userId)).toBe(10);
    expect(await service.ledger(userId)).toHaveLength(1);
  });

  it("并发扣减：只有余额足够者成功（原子守卫）", async () => {
    await service.grantInitial(userId, 50);
    const results = await Promise.all(Array.from({ length: 5 }, () => service.tryDebit(userId, 20)));
    expect(results.filter(Boolean)).toHaveLength(2);
    expect(await service.balance(userId)).toBe(10);
    const sum = (await service.ledger(userId)).reduce((a, e) => a + e.cents, 0);
    expect(sum).toBe(await service.balance(userId));
  });

  it("refund 按任务幂等：第二次退款拒绝", async () => {
    await service.grantInitial(userId, 500);
    const taskId = await createTaskRow();
    expect(await service.tryDebit(userId, 70, taskId)).toBe(true);
    expect(await service.refund(userId, 70, taskId)).toBe(true);
    expect(await service.balance(userId)).toBe(500);
    expect(await service.refund(userId, 70, taskId)).toBe(false);
    expect(await service.balance(userId)).toBe(500);
  });

  it("非法金额抛错", async () => {
    await service.grantInitial(userId, 100);
    await expect(service.tryDebit(userId, 0)).rejects.toThrow();
    const taskId = await createTaskRow();
    await expect(service.refund(userId, -5, taskId)).rejects.toThrow();
  });

  it("adminAdjust：加/减（减记 admin_adjust）", async () => {
    await service.grantInitial(userId, 100);
    expect(await service.adminAdjust(userId, 200)).toBe(300);
    const taskId = await createTaskRow();
    await service.tryDebit(userId, 50, taskId);
    expect(await service.adminAdjust(userId, -30)).toBe(220);
    const entries = await service.ledger(userId);
    expect(entries.filter((e) => e.reason === "admin_adjust").some((e) => e.cents === -30)).toBe(true);
  });

  async function createTaskRow(): Promise<string> {
    const taskId = randomUUID();
    const { error } = await supabase.from("generation_tasks").insert({
      id: taskId,
      user_id: userId,
      type: "image",
      prompt: "test",
      cost_cents: 70,
    });
    expect(error).toBeNull();
    return taskId;
  }
});
