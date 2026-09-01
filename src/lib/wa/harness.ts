// Test-harness switches. Deliberately in one file so there is exactly one place
// to audit, and deliberately impossible to enable in production: Vercel always
// sets VERCEL=1, so both checks below are false on every deployed build no
// matter what an environment variable says.
//
// Isaac, 2026-09-01: "im getting headache to have to check all your works
// manually bro." Unit suites were green while JAI had stopped answering 17 of
// 96 contacts, because every bug that day lived BETWEEN the pieces. These two
// switches let scripts/jai-conversation-check.mjs drive the real webhook —
// real routing, real guards, real order — without sending a WhatsApp message
// or spending a model call.

const offVercel = () => process.env.VERCEL !== "1";

/** Capture outbound WhatsApp sends instead of calling Meta. */
export const isDryRun = () => offVercel() && process.env.JAI_DRY_RUN === "1";

/** Answer the model call from a fixture instead of a provider. */
export const isStubbedLlm = () => offVercel() && process.env.JAI_STUB_LLM === "1";

/**
 * What the stubbed model replies. The harness sets this per scenario so a test
 * can pin the draft and assert on what the guards do to it.
 */
export const stubbedLlmReply = () =>
  process.env.JAI_STUB_LLM_REPLY ||
  '{"message":"Sure! Our group classes run every evening — let me know which day suits you."}';

/** Where captured sends are appended, one JSON object per line. */
export const dryRunLog = () => process.env.JAI_DRY_RUN_LOG || "/tmp/jai-dry-run.jsonl";
