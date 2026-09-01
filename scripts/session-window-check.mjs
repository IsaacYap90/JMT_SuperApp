// Exercises the REAL helper the webhook uses — not a copy of its logic.
import { sessionBotReplyCount as raw } from "../src/lib/wa/session-window.ts";

// Pin "now" to just after each fixture ends; otherwise every fixture is ancient
// and the whole suite trivially returns 0.
const GAP = 6 * 60 * 60 * 1000;
const sessionBotReplyCount = (rows, gap = GAP, now) =>
  raw(rows, gap, now ?? (rows.length
    ? new Date(rows[rows.length - 1].created_at ?? Date.now()).getTime() + 60_000
    : Date.now()));

let fail = 0;
const t = (name, got, want) => {
  if (got !== want) { fail++; console.log(`FAIL  ${name} — want ${want}, got ${got}`); }
  else console.log(`ok    ${name} (${got})`);
};
const at = (iso, role) => ({ role, created_at: iso });

// Isaac's real thread on 1 Sep: 12 bot replies stretching back to 20 July, of
// which only 3 were today. The old all-time count said 12 and handed him off.
const isaacLike = [
  ...Array.from({ length: 18 }, (_, i) =>
    at(`2026-07-20T12:${String(30 + i).padStart(2, "0")}:00Z`, i % 2 ? "assistant" : "user")),
  at("2026-09-01T10:22:50Z", "user"), at("2026-09-01T10:22:54Z", "assistant"),
  at("2026-09-01T10:23:25Z", "user"), at("2026-09-01T10:23:29Z", "assistant"),
  at("2026-09-01T10:23:47Z", "user"), at("2026-09-01T10:23:49Z", "assistant"),
];
t("July history does not count toward today", sessionBotReplyCount(isaacLike), 3);
t("...and so it stays under the handoff threshold", sessionBotReplyCount(isaacLike) >= 8, false);

// A genuinely long single sitting must still trip the guard — that is the bug
// the anti-loop guard exists for, and this fix must not disable it.
const oneLongSitting = Array.from({ length: 20 }, (_, i) =>
  at(`2026-09-01T09:${String(10 + i).padStart(2, "0")}:00Z`, i % 2 ? "assistant" : "user"));
t("one long sitting still trips the guard", sessionBotReplyCount(oneLongSitting) >= 8, true);

// Boundary: a gap of exactly 6h starts a new conversation; 5h59m does not.
const gapExact = [at("2026-09-01T00:00:00Z", "assistant"), at("2026-09-01T06:00:00Z", "assistant")];
t("gap of exactly 6h splits", sessionBotReplyCount(gapExact), 1);
const gapShort = [at("2026-09-01T00:00:00Z", "assistant"), at("2026-09-01T05:59:00Z", "assistant")];
t("gap of 5h59m does not split", sessionBotReplyCount(gapShort), 2);

// Degenerate input must never throw or wrongly split.
t("empty history", sessionBotReplyCount([]), 0);
t("single message", sessionBotReplyCount([at("2026-09-01T00:00:00Z", "assistant")]), 1);
// created_at is nullable and Postgres orders DESC NULLS FIRST, so a null row
// arrives LAST in `prior`. The old assertion here pinned "never split", which is
// exactly the behaviour that would have kept a customer handed off forever the
// day a null row appeared. Unreadable newest timestamp now means "fresh
// conversation" — err toward answering the customer.
t("an unreadable newest timestamp errs toward answering, not handing off",
  raw([{ role: "assistant" }, { role: "assistant", created_at: null }], GAP, Date.now()), 0);
t("a mid-array null still does not split a warm sitting",
  raw([at("2026-09-01T10:00:00Z", "assistant"),
       { role: "user" },
       at("2026-09-01T10:05:00Z", "assistant")],
      GAP, new Date("2026-09-01T10:06:00Z").getTime()), 2);

// The hole the conversation harness found: a history that is ENTIRELY old has no
// internal gap, so walking the array alone reports one long sitting and the
// customer stays handed off forever. The gap to NOW is what makes it a new
// conversation.
{
  const allOld = Array.from({ length: 18 }, (_, i) =>
    at(`2026-07-20T12:${String(30 + i).padStart(2, "0")}:00Z`, i % 2 ? "assistant" : "user"));
  const nowMuchLater = new Date("2026-09-01T10:00:00Z").getTime();
  t("a history that is entirely old counts as a fresh conversation",
    raw(allOld, GAP, nowMuchLater), 0);
  t("...and a sitting still warm does not reset",
    raw(allOld, GAP, new Date("2026-07-20T13:00:00Z").getTime()), 9);
}

console.log(fail === 0 ? "\nALL SESSION-WINDOW CASES PASSED" : `\n${fail} FAILED`);
if (fail) process.exitCode = 1;
