import { createHmac, timingSafeEqual } from "node:crypto";

// Verify Meta's `X-Hub-Signature-256` header against the RAW request body.
// Meta signs every webhook POST with HMAC-SHA256 keyed on the app secret:
//   X-Hub-Signature-256: sha256=<hex>
//
// FAIL CLOSED: if the secret is unset OR the header is missing/malformed
// we return false so the caller rejects with 403. Never fall back to trusting
// an unsigned body.
//
// Two Meta apps sign our webhooks with DIFFERENT secrets (2026-07-20 outage):
// WhatsApp = "JMT AI Bot" (META_APP_SECRET), Lead Ads = "JMT Leads"
// (LEADS_APP_SECRET). Callers pass secretOverride to pick; default stays
// META_APP_SECRET for the WhatsApp webhook.
export function verifyMetaSignature(
  rawBody: string,
  header: string | null,
  secretOverride?: string,
): boolean {
  const secret = secretOverride ?? process.env.META_APP_SECRET;
  if (!secret || !header) return false;

  const expected =
    "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
