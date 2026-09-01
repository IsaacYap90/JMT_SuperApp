import { existsSync, readFileSync } from "node:fs";

// Test-harness switches. Deliberately in one file so there is exactly one place
// to audit. Enabling either in production takes TWO independent
// misconfigurations — not "impossible", and the honest wording matters so
// nobody later treats this as absolute. Vercel sets VERCEL=1 and VERCEL_ENV on
// every deployment including previews, and neither opt-in var exists on the
// project; off Vercel the first gate is simply absent, which is why the
// VERCEL_ENV check below is here too.
//
// Isaac, 2026-09-01: "im getting headache to have to check all your works
// manually bro." Unit suites were green while JAI had stopped answering 17 of
// 96 contacts, because every bug that day lived BETWEEN the pieces. These two
// switches let scripts/jai-conversation-check.mjs drive the real webhook —
// real routing, real guards, real order — without sending a WhatsApp message
// or spending a model call.

const offVercel = () =>
  process.env.VERCEL !== "1" && process.env.VERCEL_ENV !== "production";

/** Capture outbound WhatsApp sends instead of calling Meta. */
export const isDryRun = () => offVercel() && process.env.JAI_DRY_RUN === "1";

/** Answer the model call from a fixture instead of a provider. */
export const isStubbedLlm = () => offVercel() && process.env.JAI_STUB_LLM === "1";

/**
 * What the stubbed model replies. The harness sets this per scenario so a test
 * can pin the draft and assert on what the guards do to it.
 */
export function stubbedLlmReply(): string {
  // Read per call, not per process, so a scenario can pin the draft it wants the
  // guards to chew on. Without this the fixture is constant and any check that
  // asserts "the guards removed X" passes because X was never there.
  try {
    const f = process.env.JAI_STUB_LLM_REPLY_FILE;
    if (f && existsSync(f)) {
      const v = readFileSync(f, "utf8").trim();
      if (v) return v;
    }
  } catch { /* fall through to the default */ }
  return (
    process.env.JAI_STUB_LLM_REPLY ||
    '{"message":"Sure! Our group classes run every evening — let me know which day suits you."}'
  );
}

/** Where captured sends are appended, one JSON object per line. */
export const dryRunLog = () => process.env.JAI_DRY_RUN_LOG || "/tmp/jai-dry-run.jsonl";
