// LAYER 0 — which language do we answer in?
//
// WHY: the model already handles Chinese correctly. Every path that BYPASSES
// the model did not. On 15 Sep 2026 a Mandarin-speaking lead (Vivi@n,
// +65 9697 3505) got three English messages inside one Chinese thread:
//   - the canned schedule reply    → deterministic-answers.ts copy.scheduleNoDayAsk
//   - both silent nudges            → followup-dropin.ts silentNudge1 / silentNudge2
// The tell was latency: the canned reply was stored in the SAME SECOND as her
// message, while every model-written reply in the thread took 2-3 seconds.
//
// Deliberately two languages, not a locale system. JMT's leads write English or
// Chinese; Malay shows up only as loanwords inside English sentences ("esok",
// "boleh"), which is why counting CJK characters is enough and a word list is
// not needed.

export type Lang = "en" | "zh";

const CJK = /[一-鿿㐀-䶿]/g;

/**
 * Chinese when the message carries real Chinese content, not one stray glyph.
 *
 * A threshold, not mere presence: an English sentence quoting a single Chinese
 * word is still English. Two characters is the floor because genuine enquiries
 * here are very short — "课程表" (timetable) is three, and it is exactly the
 * message that triggered the canned English reply.
 *
 * The 3:1 weighting compares like with like: one Chinese character carries
 * roughly as much as one short English word, so "一周可能3-4次 我比较prefer
 * weekdays" reads as Chinese, which is what she was writing.
 */
export function detectLang(text: string): Lang {
  const cjk = (text || "").match(CJK)?.length ?? 0;
  if (cjk < 2) return "en";
  const letters = (text || "").match(/[a-z]/gi)?.length ?? 0;
  return cjk * 3 >= letters ? "zh" : "en";
}

/**
 * The language of a conversation, from the customer's own messages.
 *
 * 🛑 ANY Chinese message wins, rather than the most recent one. Vivi@n's LAST
 * inbound was "ok thanks" — pure English — after eight Chinese messages. Taking
 * the latest would have classed her as an English speaker and re-introduced the
 * exact bug this file exists to fix. The asymmetry is the argument: answering a
 * bilingual lead in Chinese is fine, answering a Mandarin-only lead in English
 * is the defect.
 *
 * Pass her recent inbound messages; order does not matter.
 */
export function detectLangFromHistory(userMessages: string[]): Lang {
  for (const m of userMessages || []) {
    if (detectLang(m) === "zh") return "zh";
  }
  return "en";
}
