import assert from "node:assert/strict";
import {
  detectHumanTakeoverIntent,
  evaluateFollowupEligibility,
  hasUnverifiedOperationalClaim,
} from "../src/lib/wa/human-takeover.ts";

for (const message of [
  "Please let me contact Coach Jeremy, can I change my session from 15 Oct to 14 Oct 3pm?",
  "I still need Coach Jeremy real reply instead of this automated reply",
  "Can we move my trial to Sunday?",
]) {
  assert.equal(detectHumanTakeoverIntent(message), true, message);
}
for (const message of [
  "What time is class?",
  "What is your location?",
  "How much is the drop-in?",
  "Can I change from Beginner class to All Levels?",
]) {
  assert.equal(detectHumanTakeoverIntent(message), false, message);
}

for (const reply of [
  "We are open right now.",
  "Coach Jeremy will be around for classes today.",
  "That timing can work.",
  "Afternoons are usually fine.",
  "I will make sure Coach Jeremy is expecting you.",
  "I will give Coach Jeremy a heads up.",
  "See you inside!",
  "Yep — we're open, come on up.",
  "Walking in is fine, see you up there.",
  "Just head up and we'll get you in.",
]) {
  assert.equal(hasUnverifiedOperationalClaim(reply), true, reply);
}
for (const reply of [
  "The scheduled All Levels class is at 12:15pm.",
  "I will pass this to Coach Jeremy and pause automated replies.",
  "I cannot verify whether the gym is open right now.",
  "Coach Jeremy will confirm whether he is available.",
  "Are you open right now?",
  "Coach Jeremy teaches classes on Friday.",
  "Afternoons are listed in the timetable.",
  "Mornings are available on Saturday.",
  "We're open Mon–Sat for group classes.",
  "We're open from 7am on Saturdays.",
]) {
  assert.equal(hasUnverifiedOperationalClaim(reply), false, reply);
}

const at = (minute, role, message, via = role === "assistant" ? "bot" : null) => ({
  created_at: `2026-10-01T10:${String(minute).padStart(2, "0")}:00Z`,
  role,
  message,
  via,
});
const eligibility = (userMessage, answerBody, options = {}) =>
  evaluateFollowupEligibility({
    history: [
      at(0, "user", userMessage),
      at(5, "assistant", answerBody),
      ...(options.history || []),
    ],
    anchorAt: new Date("2026-10-01T10:05:00Z").getTime(),
    answerBody,
    armedBy: options.armedBy || "silent",
  });

for (const [name, userMessage, answerBody] of [
  ["coach handoff", "Can I pay by PayNow?", "I will ask Coach Jeremy to confirm."],
  ["closed", "Thank you", "You are welcome."],
  ["distance decline", "It is too far, I cannot make it.", "No problem."],
  ["illness deferral", "I will contact you again once I recover.", "Rest well."],
  ["leasing", "This is a commercial leasing enquiry.", "Thanks."],
  ["membership", "Can I get a six month membership?", "Here are the rates."],
  ["reschedule", "Can I move my trial to Sunday?", "I will check."],
]) {
  assert.equal(eligibility(userMessage, answerBody).eligible, false, name);
}

assert.equal(
  eligibility("Where are you located?", "We are at 45 Ubi Road 1.").eligible,
  true,
  "a factual answer may still be nudged (Isaac, 2026-10-12: no-question rule removed)"
);
assert.equal(
  eligibility("Which class suits a beginner?", "All Levels is suitable. Which day works for you?").eligible,
  true,
  "a genuine unresolved next-step question may be followed up"
);
assert.equal(
  eligibility("What training plan suits a beginner?", "Start with All Levels. Which day works for you?").eligible,
  true,
  "the word plan alone must not trigger membership suppression"
);
assert.equal(
  eligibility("Can I try one class?", "Book the $42 drop-in at https://jaimuaythai.com/booking", { armedBy: "link" }).eligible,
  true,
  "a genuine booking-link follow-up remains eligible"
);
assert.equal(
  eligibility("Which class suits a beginner?", "Which day works for you?", {
    history: [at(6, "assistant", "Coach here - Tuesday is best.", "human")],
  }).eligible,
  false,
  "a manual reply after the anchor must suppress automation"
);

for (const t of [
  "Do I need to talk to the coach before I join sparring?",
  "Can Coach Jeremy speak Mandarin?",
  "Will the class time change during the holidays?",
  "Is this an automated reply?",
]) assert.equal(detectHumanTakeoverIntent(t), false, t);
for (const t of [
  "Can I speak to Coach Jeremy?",
  "I need to reschedule my trial to Friday",
  "I want a real person please",
]) assert.equal(detectHumanTakeoverIntent(t), true, t);

console.log("human-takeover-check: all assertions passed");
