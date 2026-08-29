import { InvalidTransitionError, canTransition, nextStatus } from "./state-machine";

describe("生成任务状态机", () => {
  it("合法迁移：queued→running→succeeded", () => {
    expect(canTransition("queued", "running")).toBe(true);
    expect(canTransition("running", "succeeded")).toBe(true);
    expect(nextStatus("queued", "running")).toBe("running");
  });

  it("合法迁移：running/queued → failed", () => {
    expect(canTransition("running", "failed")).toBe(true);
    expect(canTransition("queued", "failed")).toBe(true);
  });

  it("合法迁移：queued → succeeded（同步 API 立即出图）", () => {
    expect(canTransition("queued", "succeeded")).toBe(true);
  });

  it("非法迁移抛 InvalidTransitionError", () => {
    for (const [from, to] of [
      ["succeeded", "running"],
      ["succeeded", "failed"],
      ["failed", "running"],
      ["running", "queued"],
      ["queued", "queued"],
    ] as const) {
      expect(() => nextStatus(from, to)).toThrow(InvalidTransitionError);
      expect(canTransition(from, to)).toBe(false);
    }
  });

  it("终态不可迁出", () => {
    expect(canTransition("succeeded", "succeeded")).toBe(false);
    expect(canTransition("failed", "failed")).toBe(false);
  });
});
