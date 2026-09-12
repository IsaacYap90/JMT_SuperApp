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

// ── isRepeatingItself — the anti-loop guard's repetition test ───────────────
// Added 12 Sep 2026. This decision has been wrong in production twice and had
// no test either time. Both bugs are LATCHING bugs: the guard fires once, then
// keeps firing on brand-new answerable questions. So the cases that matter are
// the ones AFTER the handoff has been sent.
import { isRepeatingItself } from "../src/lib/wa/session-window.ts";

const HANDOFF =
  "Let me get Coach Jeremy to sort this out for you directly 🙏 He'll reach out to you shortly.";
const A = "On Tuesday we run All-Levels at 12:15–1:15pm 🥊";
const B = "*Adults Unlimited*\n1mo $280";
const C = "Bring shorts, water and a towel 🙂";

let rfails = 0;
const rcheck = (name, bot, want) => {
  const got = isRepeatingItself(bot, HANDOFF);
  const ok = got === want;
  if (!ok) rfails++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name} -> ${got} (want ${want})`);
};

console.log("isRepeatingItself");
rcheck("no messages", [], false);
rcheck("one message", [A], false);
rcheck("two different replies", [A, B], false);
rcheck("three different replies", [A, B, C], false);
// the genuine case the guard exists for
rcheck("same reply twice in a row", [A, A], true);
rcheck("same reply twice, after other replies", [C, B, A, A], true);

// 🛑 THE LATCH. The handoff has been sent; the customer then asks something new
// and gets a real answer. The guard must NOT still report repetition.
rcheck("after handoff, newest message IS the handoff", [A, A, HANDOFF], false);
rcheck("after handoff, then a fresh answer", [A, A, HANDOFF, B], false);
rcheck(
  "after handoff, then several fresh answers",
  [A, A, HANDOFF, B, HANDOFF, C],
  false
);
// 🛑 The REALISTIC latch sequence. While the guard is firing, outText is REPLACED
// by the handoff before the row is stored — so the thread does not accumulate
// fresh answers, it accumulates handoffs. Under the previous implementation
// (which filtered the handoff out of the comparison) the genuine duplicate pair
// stayed the newest two non-handoff messages, so this returned true forever and
// every new question got deflected. These are the cases that distinguish the
// fix; the "fresh answer" cases above cannot, because a fresh answer is never
// stored while the guard is latched.
rcheck("latched: two handoffs in a row", [A, A, HANDOFF, HANDOFF], false);
rcheck("latched: five handoffs in a row", [A, A, HANDOFF, HANDOFF, HANDOFF, HANDOFF, HANDOFF], false);
// ...but a NEW genuine repetition after a handoff must still be caught.
rcheck("new repetition after a handoff", [A, A, HANDOFF, B, B], true);
// whitespace/punctuation/case must not defeat it
rcheck("same reply, different punctuation", [A, A.replace("🥊", "!")], true);
rcheck("blank messages are ignored", ["", A, "", A], true);

console.log(
  `\n${rfails === 0 ? "ALL REPEAT CASES PASSED" : `${rfails} REPEAT CASE(S) FAILED`}`
);
if (rfails > 0) process.exitCode = 1;
