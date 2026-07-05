import { createHmac, timingSafeEqual } from "node:crypto";

// Verify Meta's `X-Hub-Signature-256` header against the RAW request body.
// Meta signs every webhook POST with HMAC-SHA256 keyed on the app secret:
//   X-Hub-Signature-256: sha256=<hex>
//
// FAIL CLOSED: if META_APP_SECRET is unset OR the header is missing/malformed
// we return false so the caller rejects with 403. Never fall back to trusting
// an unsigned body.
export function verifyMetaSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !header) return false;

  const expected =
    "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
