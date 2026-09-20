/**
 * AES-256-GCM token encryption for Google OAuth tokens at rest.
 *
 * Env var: GCAL_TOKEN_ENCRYPTION_KEY — 64-char hex string (32 bytes).
 * Generate: `openssl rand -hex 32`
 *
 * Format: base64(iv:ciphertext:authTag) — 12-byte IV, 16-byte tag.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALG = "aes-256-gcm" as const;
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey(): Buffer {
  const hex = process.env.GCAL_TOKEN_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("GCAL_TOKEN_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // iv + ciphertext + tag, then base64 the whole thing
  const combined = Buffer.concat([iv, encrypted, tag]);
  return combined.toString("base64");
}

export function decrypt(encoded: string): string {
  const key = getKey();
  const combined = Buffer.from(encoded, "base64");
  if (combined.length < IV_LEN + TAG_LEN) {
    throw new Error("Invalid encrypted token: too short");
  }
  const iv = combined.subarray(0, IV_LEN);
  const tag = combined.subarray(combined.length - TAG_LEN);
  const ciphertext = combined.subarray(IV_LEN, combined.length - TAG_LEN);
  const decipher = createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}
