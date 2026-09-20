// Language check — the canned paths must answer in the language the lead wrote.
//
//   node --import ./scripts/ts-resolve.mjs scripts/lang-check.mjs
//
// WHY THIS EXISTS. The fact sheet has ordered "Chinese in, Chinese out" since
// 25 Aug 2026, after Huiling opened with "你好", was answered in English, and
// never replied again. The MODEL obeyed it. Every path that bypasses the model
// did not, and on 15-16 Sep Vivi@n (+65 9697 3505) got three English messages
// inside an otherwise Chinese thread: the canned schedule reply and both silent
// nudges. The tell was latency — the canned reply was stored in the same second
// as her message, while every model reply took 2-3s.
//
// 🛑 HALF OF THIS FILE IS A CONTROL. Per JAI.md: a check you have never seen go
// red proves nothing, and neither does one the OLD code also passes. So every
// interesting case is run twice — once against a config with no `copyZh`, which
// is exactly the old English-only behaviour, and once against the shipped one.
// A case that comes out the same under both is dead weight and is called out.

import {
  DEFAULT_CONFIG,
  buildDeterministicAnswer,
  hasBookingOffer,
  BOOKING_OFFER_MARKER,
} from "../src/lib/wa/deterministic-answers.ts";
import { detectLang, detectLangFromHistory } from "../src/lib/wa/lang.ts";
import {
  silentNudge1,
  silentNudge2,
  dropinNudge1,
  dropinNudge2,
} from "../src/lib/wa/followup-dropin.ts";
import { extractFollowupFacts } from "../src/lib/wa/followup-facts.ts";
import { JAI_FACTS } from "../src/lib/wa/jai-facts.ts";

let failed = 0;
let flipped = 0;
let deadweight = 0;

function ok(name, cond, detail = "") {
  if (cond) console.log(`ok    ${name}`);
  else {
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

const hasCJK = (s) => /[一-鿿]/.test(s || "");

// ── detectLang: her real messages, verbatim from jai.conversations ──────────
ok('detectLang("课程表") is zh', detectLang("课程表") === "zh");
ok('detectLang("hi 我想了解课程") is zh', detectLang("hi 我想了解课程") === "zh");
ok(
  'detectLang("一周可能3-4次 我比较prefer weekdays") is zh — mixed, mostly Chinese',
  detectLang("一周可能3-4次 我比较prefer weekdays") === "zh"
);
ok('detectLang("ok thanks") is en', detectLang("ok thanks") === "en");
ok('detectLang("what time is the class") is en', detectLang("what time is the class") === "en");
// A stray glyph must not flip an English sentence.
ok(
  'detectLang("Is the 课 at 7pm?") is en — one CJK word inside English',
  detectLang("Is the 课 at 7pm?") === "en"
);
ok('detectLang("") is en', detectLang("") === "en");
ok('detectLang("👍") is en', detectLang("👍") === "en");

// ── detectLangFromHistory: the whole thread, newest first ───────────────────
// 🛑 The case that matters. Her LAST inbound was "ok thanks" — pure English.
// Reading only the newest message classes a Mandarin-only lead as English and
// reintroduces the bug.
const vivianNewestFirst = [
  "ok thanks",
  "1对1 不是签一个月的课程？ 所以都是算堂课？",
  "减重减脂肪",
  "1对1的价钱 大概多少",
  "我会选择7:30pm 下班后 然后这些是有教练带？",
  "一周可能3-4次 我比较prefer weekdays",
  "课程表",
  "hi 我想了解课程",
];
ok(
  "Vivi@n's thread is zh even though her last message was English",
  detectLangFromHistory(vivianNewestFirst) === "zh"
);
ok(
  "a wholly English thread stays en",
  detectLangFromHistory(["ok thanks", "what time", "hi"]) === "en"
);
ok("an empty history is en", detectLangFromHistory([]) === "en");

// ── The control: the OLD config is the shipped one minus copyZh ─────────────
const OLD_CONFIG = { ...DEFAULT_CONFIG };
delete OLD_CONFIG.copyZh;

function bothWays(name, run, { expectFlip }) {
  const before = run(OLD_CONFIG);
  const after = run(DEFAULT_CONFIG);
  const didFlip = before !== after;
  if (didFlip) flipped++;
  else deadweight++;
  if (expectFlip && !didFlip) {
    console.log(`FAIL  ${name} — identical under both configs, so it proves nothing`);
    console.log(`        both: ${String(before).slice(0, 90)}`);
    failed++;
    return { before, after };
  }
  if (!expectFlip && didFlip) {
    console.log(`FAIL  ${name} — changed for an English lead, that is a regression`);
    console.log(`        old: ${String(before).slice(0, 90)}`);
    console.log(`        new: ${String(after).slice(0, 90)}`);
    failed++;
    return { before, after };
  }
  console.log(`ok    ${name}${expectFlip ? " (flipped)" : " (unchanged, as intended)"}`);
  return { before, after };
}

const answerFor = (text) => (cfg) => {
  const a = buildDeterministicAnswer(text, JAI_FACTS, cfg);
  return a ? a.messageText : null;
};

// The exact message that broke: "课程表" (timetable).
const sched = bothWays("课程表 → schedule reply", answerFor("课程表"), { expectFlip: true });
ok("  old answer was English", !hasCJK(sched.before) && /classes/i.test(String(sched.before)));
ok("  new answer is Chinese", hasCJK(sched.after));

// A Chinese price question.
// 🛑 NOT "上课费用" — it scores 0 and never reaches this layer at all. That is a
// real pre-existing gap (priceStrong carries 收费 / 学费 / 价格 / 多少钱 but not
// 费用), and it is exactly what Vivi@n wrote at 15:09. Left alone deliberately:
// it falls through to the model, which answered her correctly in Chinese in 1s.
// Logged for Isaac rather than widened here.
const price = bothWays("多少钱 → price reply", answerFor("多少钱"), { expectFlip: true });
ok("  new price answer is Chinese", hasCJK(price.after));
// 🛑 The sheet's rule: translate the sentences, never the facts inside them.
// A dollar figure must survive the switch untouched.
ok(
  "  the price figure itself is NOT translated",
  /\$\s?\d/.test(String(price.after)),
  String(price.after).slice(0, 120)
);

// English leads must be byte-identical to before. This is the regression half.
bothWays("timetable → schedule reply", answerFor("timetable"), { expectFlip: false });
bothWays("how much is it → price reply", answerFor("how much is it"), { expectFlip: false });
bothWays("what time is the monday class", answerFor("what time is the monday class"), {
  expectFlip: false,
});

// ── The booking offer has to be HEARD in both languages ─────────────────────
// Translating the trailer without this makes JAI ask a question it cannot hear
// — the Arthur bug, in the other language.
const zhTrailer = DEFAULT_CONFIG.copyZh?.priceTrailer ?? "";
ok("a Chinese price trailer exists", zhTrailer.length > 0);
ok(
  "the OLD English-only marker test does NOT recognise it (this is the bug)",
  !zhTrailer.includes(BOOKING_OFFER_MARKER)
);
ok("hasBookingOffer() DOES recognise it", hasBookingOffer(zhTrailer));
ok(
  "hasBookingOffer() still recognises the English trailer",
  hasBookingOffer(DEFAULT_CONFIG.copy.priceTrailer)
);
ok("hasBookingOffer() says no to an unrelated line", !hasBookingOffer("Anything else I can help with?"));
// The youth trailer must never carry the offer, in either language.
ok(
  "the Chinese youth trailer carries NO booking offer",
  !hasBookingOffer(DEFAULT_CONFIG.copyZh?.priceTrailerYouth ?? "")
);

// ── The four follow-up nudges ───────────────────────────────────────────────
const parsedFollowupFacts = extractFollowupFacts(JAI_FACTS);
if (!parsedFollowupFacts.ok) throw new Error(parsedFollowupFacts.reason);
for (const [name, fn] of [
  ["silentNudge1", silentNudge1],
  ["silentNudge2", silentNudge2],
  ["dropinNudge1", dropinNudge1],
  ["dropinNudge2", dropinNudge2],
]) {
  const en = name.startsWith("dropin")
    ? fn("Vivi@n", "en", parsedFollowupFacts.value)
    : fn("Vivi@n");
  const zh = name.startsWith("dropin")
    ? fn("Vivi@n", "zh", parsedFollowupFacts.value)
    : fn("Vivi@n", "zh");
  ok(`${name}() default is unchanged English`, !hasCJK(en) && en.length > 0);
  ok(`${name}(_, "zh") is Chinese`, hasCJK(zh));
  ok(`${name} keeps her name verbatim`, zh.includes("Vivi@n"));
}
// The drop-in nudges quote a price and a URL — neither may be translated.
ok('dropinNudge1 zh keeps "$42"', dropinNudge1("A", "zh", parsedFollowupFacts.value).includes("$42"));
ok("dropinNudge1 zh keeps the booking URL", /https?:\/\//.test(dropinNudge1("A", "zh", parsedFollowupFacts.value)));

console.log(
  `\n${flipped} case(s) flipped between old and new, ${deadweight} identical under both.`
);
if (failed) {
  console.log(`\n${failed} FAILED`);
  process.exit(1);
}
console.log("ALL LANGUAGE CASES PASSED");
