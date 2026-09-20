import assert from "node:assert/strict";
import { JAI_FACTS } from "../src/lib/wa/jai-facts.ts";
import { extractFollowupFacts } from "../src/lib/wa/followup-facts.ts";
import { dropinNudge1, dropinNudge2 } from "../src/lib/wa/followup-dropin.ts";

const parsed = extractFollowupFacts(JAI_FACTS);
assert.equal(parsed.ok, true, parsed.ok ? "" : parsed.reason);
if (!parsed.ok) process.exit(1);
assert.deepEqual(parsed.value, {
  price: "$42",
  bookingUrl: "https://jaimuaythai.com/booking",
});

assert.equal(
  dropinNudge1("Sam", "en", parsed.value),
  "Hey Sam! Still keen to jump in? 🥊\n\n" +
    "A drop-in class is $42 — same class, same coaches, beginners welcome. " +
    "Takes a minute to book: https://jaimuaythai.com/booking\n\n" +
    "Rather ask me something first? Just reply here."
);
assert.equal(
  dropinNudge2("Sam", "en", parsed.value),
  "Last check, Sam — want to come try a class this week? 🙂\n\n" +
    "The $42 drop-in is here whenever you're ready: https://jaimuaythai.com/booking\n\n" +
    "Already booked? Ignore this and see you at the gym 🙏 If now's not the right time, no stress at all."
);
assert.throws(() => dropinNudge1("Sam", "en"), /live follow-up facts are required/);

const canonical = "$42 for a single class, booked and paid at https://jaimuaythai.com/booking";
assert.equal(extractFollowupFacts(JAI_FACTS.replace(canonical, "")).ok, false);
assert.equal(
  extractFollowupFacts(JAI_FACTS.replace(canonical, canonical.replace("https://", "http://"))).ok,
  false
);
assert.equal(
  extractFollowupFacts(JAI_FACTS.replace("- Drop-in class: $42", "- Drop-in class: $43")).ok,
  false
);
assert.equal(
  extractFollowupFacts(JAI_FACTS.replace(canonical, `${canonical}\n${canonical}`)).ok,
  false
);

console.log("followup-facts-check: all assertions passed");
