/**
 * Admin API Key 加解密（CONCLUSIONS D4/D13）。
 * AES-256-GCM；密钥 = sha256(ENCRYPTION_KEY)。明文永不回传。
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function keyBytes(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

export function secretHint(plain: string): string {
  const tail = plain.replace(/\s/g, "").slice(-4);
  return tail ? `****${tail}` : "****";
}

export function encryptSecret(plain: string, encryptionKey: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(encryptionKey), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSecret(payload: string, encryptionKey: string): string {
  const buf = Buffer.from(payload, "base64");
  if (buf.length < 29) throw new Error("corrupt secret");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(encryptionKey), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
