/**
 * Test: gcal token encryption round-trip.
 * Run: GCAL_TOKEN_ENCRYPTION_KEY=$(openssl rand -hex 32) node --import ./scripts/ts-resolve.mjs scripts/gcal-crypto-check.mjs
 */

import assert from "node:assert/strict";

// Generate a key for testing if not set
if (!process.env.GCAL_TOKEN_ENCRYPTION_KEY) {
  const { randomBytes } = await import("node:crypto");
  process.env.GCAL_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("hex");
}

const { encrypt, decrypt } = await import("../src/lib/gcal/crypto.ts");

const tests = [
  "ya29.a0ARrdaM-short-token",
  "1//0eXLong_RefreshToken_With_Special-Chars==",
  '{"access_token":"ya29.xxx","refresh_token":"1//0exxx"}',
  "", // empty string edge case — allowed
  "a".repeat(10000), // large token
  "Unicode: \u00e9\u00e0\u00fc\u00f1",
];

let passed = 0;
for (const plaintext of tests) {
  const encrypted = encrypt(plaintext);
  assert.notEqual(encrypted, plaintext, "Encrypted should differ from plaintext");
  assert.ok(typeof encrypted === "string" && encrypted.length > 0, "Encrypted should be a non-empty string");

  const decrypted = decrypt(encrypted);
  assert.equal(decrypted, plaintext, `Round-trip failed for: "${plaintext.slice(0, 30)}..."`);

  // Encrypting same plaintext twice should produce different ciphertexts (random IV)
  const encrypted2 = encrypt(plaintext);
  assert.notEqual(encrypted, encrypted2, "Two encryptions of same plaintext should differ (random IV)");
  assert.equal(decrypt(encrypted2), plaintext, "Second encryption should also decrypt correctly");

  passed++;
}

// Test wrong key rejection
const original = process.env.GCAL_TOKEN_ENCRYPTION_KEY;
const ciphertext = encrypt("test-token");
const { randomBytes: rb } = await import("node:crypto");
process.env.GCAL_TOKEN_ENCRYPTION_KEY = rb(32).toString("hex");
try {
  decrypt(ciphertext);
  assert.fail("Decryption with wrong key should throw");
} catch (err) {
  if (err.code === "ERR_ASSERTION") throw err;
  // Expected: decryption failure
  passed++;
}
process.env.GCAL_TOKEN_ENCRYPTION_KEY = original;

// Test invalid key length rejection
process.env.GCAL_TOKEN_ENCRYPTION_KEY = "tooshort";
try {
  encrypt("test");
  assert.fail("Should reject short key");
} catch (err) {
  if (err.code === "ERR_ASSERTION") throw err;
  assert.ok(err.message.includes("64-char hex"), "Error should mention 64-char hex");
  passed++;
}
process.env.GCAL_TOKEN_ENCRYPTION_KEY = original;

// Test corrupted ciphertext rejection
try {
  decrypt("definitelynotbase64ciphertext!!!");
  assert.fail("Should reject corrupted ciphertext");
} catch (err) {
  if (err.code === "ERR_ASSERTION") throw err;
  passed++;
}

console.log(`\u2705 gcal-crypto-check: ${passed} assertions passed`);
