import { decryptSecret, encryptSecret, secretHint } from "./secret-crypto";

describe("secret-crypto", () => {
  it("round-trip", () => {
    const key = "test-encryption-key";
    const plain = "sk-live-abcdef1234";
    const enc = encryptSecret(plain, key);
    expect(enc).not.toContain(plain);
    expect(decryptSecret(enc, key)).toBe(plain);
    expect(secretHint(plain)).toBe("****1234");
  });

  it("wrong key fails", () => {
    const enc = encryptSecret("hello", "k1");
    expect(() => decryptSecret(enc, "k2")).toThrow();
  });
});
