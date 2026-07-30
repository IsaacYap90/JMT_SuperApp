// Fully synthetic WhatsApp inbox data for filmed demos.
//
// Why a fixture instead of masking: contact names and numbers can be masked
// field-by-field, but real first names also appear INSIDE message bodies
// ("Welcome Gwen", "Hi Cher!"). No regex reliably finds every name in free text,
// so for filming we replace the inbox contents outright. Nothing real reaches the
// screen, and the real JAI database is never read or written for this view.
//
// The replies below follow JAI's ACTUAL rules from src/lib/wa/jai-facts.ts —
// this is a demo of the real product, so inventing plausible-sounding answers
// would misrepresent it. In particular:
//   - the trial is FREE and a fee is never quoted
//   - Calendly is the ONLY source of trial availability; Jai never promises a
//     specific trial day/time, and never offers a regular class time as a trial
//   - pricing starts at $280/mo for adults, with the rates page for the rest
//   - PT is a priority lead: $50-60 trial, then straight to Coach Jeremy
//   - a freeze is min 2 weeks, medical/overseas only, actioned only by Jeremy
//
// Only used when demo mode is on. Off => the inbox behaves exactly as before.

export type DemoRole = "user" | "assistant";
export type DemoMsg = { id: string; role: DemoRole; body: string; via?: string | null; ts: string };
export type DemoConv = {
  phone: string;
  name: string | null;
  last_ts: string;
  last_body: string;
  last_role: DemoRole;
  paused: boolean;
  isMember: boolean;
  messages: DemoMsg[];
};

// Timestamps are built relative to load time so the date dividers read
// "Today" / "Yesterday" naturally on the day of filming.
function at(daysAgo: number, hh: number, mm: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
}

let seq = 0;
const msg = (role: DemoRole, body: string, ts: string, via?: string | null): DemoMsg => ({
  id: `demo-${++seq}`,
  role,
  body,
  via: via ?? null,
  ts,
});

function conv(
  phone: string,
  name: string,
  isMember: boolean,
  paused: boolean,
  messages: DemoMsg[]
): DemoConv {
  const last = messages[messages.length - 1];
  return {
    phone,
    name,
    last_ts: last.ts,
    last_body: last.body,
    last_role: last.role,
    paused,
    isMember,
    messages,
  };
}

export const DEMO_CONVERSATIONS: DemoConv[] = [
  // 1. Adult trial enquiry — the core lead flow. Free trial, age group first,
  //    then the matching Calendly link. No day/time ever promised.
  conv("6591230001", "Aaron Tan", false, false, [
    msg("user", "Hi, saw your ad. Do you have trial class for beginner?", at(0, 9, 12)),
    msg(
      "assistant",
      "Yes, we definitely have a free trial! Everyone gets one free session. Trial slots are limited each week, so they fill up fast.\n\nWhich age group would it be for?\n- Adults\n- Kids (6–10)\n- Pre-Teen (11–14)\n\nLet me send you the right booking link once I know 😊",
      at(0, 9, 12)
    ),
    msg("user", "Adults, for myself", at(0, 9, 19)),
    msg(
      "assistant",
      "Perfect 🥊 Here's the link to book your free trial — just pick a time that works for you:\nhttps://calendly.com/jaimuaythaisg/muay-thai-trial-class\n\nJust bring workout clothes, water and a towel. You can borrow our gloves for the trial. Reply \"Done\" once you've booked and I'll confirm everything 👍",
      at(0, 9, 20)
    ),
    msg("user", "Done", at(0, 9, 24)),
    msg("assistant", "Got it, Aaron — you're all set! See you at the gym 🙌", at(0, 9, 24)),
  ]),

  // 2. Kids enquiry — parent asks, Pre-Teen band, parent should attend.
  conv("6591230002", "Michelle Lim", false, false, [
    msg("user", "Hi, my son is 12. Can he join?", at(0, 8, 40)),
    msg(
      "assistant",
      "Yes! For a 12-year-old that's our Pre-Teen class (ages 11–14) 🥊 We keep those classes small, capped at 10 per class, so every child gets the coaches' full attention.\n\nHere's the link to book his free trial:\nhttps://calendly.com/jaimuaythaisg/kids-pre-teen-muay-thai-trial-class\n\nA parent should come along to the trial too. Reply \"Done\" once you've booked 👍",
      at(0, 8, 41)
    ),
    msg("user", "Ok noted, thanks!", at(0, 8, 58)),
  ]),

  // 3. Pricing — starting price + rates page, never the full tier list.
  conv("6591230003", "Daniel Ong", false, false, [
    msg("user", "How much is the monthly?", at(1, 17, 5)),
    msg(
      "assistant",
      "Our adult monthly unlimited starts at $280/mo. You can check out all the options here: https://jaimuaythai.com/rates-2/\n\nIf you haven't trained with us yet, the free trial is the best place to start — happy to send you the booking link 😊",
      at(1, 17, 6)
    ),
    msg("user", "Yes send me the trial link", at(1, 17, 9)),
    msg(
      "assistant",
      "Here you go: https://calendly.com/jaimuaythaisg/muay-thai-trial-class\n\nPick any open slot that suits you. Reply \"Done\" once booked and I'll confirm 👍",
      at(1, 17, 10)
    ),
  ]),

  // 4. PT enquiry — priority lead. Jai states the $50-60 trial, asks goal,
  //    then hands straight to Coach Jeremy (who replies himself).
  conv("6591230004", "Priya Nair", false, true, [
    msg("user", "Hi, do you do one to one personal training?", at(1, 12, 30)),
    msg(
      "assistant",
      "Hi Priya, thanks for your interest in 1-to-1 personal training! I'm Jai, Coach Jeremy's assistant 😊\n\nFor 1-to-1 PT, a trial session runs $50–60 depending on the coach — it's a single one-on-one session so we can assess where you're at and build everything around your goals.\n\nQuick question so I pair you with the right coach — what's your main goal: general fitness, technique, weight loss, or working towards competing? And what days/times usually work for you?",
      at(1, 12, 31)
    ),
    msg("user", "Mainly weight loss. Weekday evenings after 7pm", at(1, 12, 44)),
    msg(
      "assistant",
      "Perfect, that helps a lot. Happy to get your first session locked in — passing you to Coach Jeremy now and he'll follow up with you personally 🙏",
      at(1, 12, 45)
    ),
    msg(
      "assistant",
      "Hi Priya, Jeremy here. Weekday evenings after 7 works well on my side. Let's get your trial session sorted this week :)",
      at(1, 12, 58),
      "human"
    ),
  ]),

  // 5. Membership freeze — policy stated, reason gathered, escalated to Jeremy.
  conv("6591230005", "Marcus Yeo", true, false, [
    msg("user", "Coach I need to freeze my membership, going overseas for work", at(2, 20, 15)),
    msg(
      "assistant",
      "No problem, we can look into that. Freezes are a minimum of 2 weeks and are for medical reasons or overseas travel, so yours qualifies 👍\n\nRoughly which dates will you be away? Coach Jeremy actions the freeze on his side, so I'll pass the details straight to him.",
      at(2, 20, 16)
    ),
    msg("user", "12 Aug to 5 Sep", at(2, 20, 18)),
    msg("assistant", "Got it, passing that to Coach Jeremy now — he'll confirm with you 🙏", at(2, 20, 18)),
    msg("assistant", "Hi Marcus, all frozen from 12 Aug to 5 Sep. Safe travels, see you when you're back :)", at(2, 20, 41), "human"),
  ]),

  // 6. Running late — the 15-minute buffer, warm, never "come whenever".
  conv("6591230006", "Rachel Koh", true, false, [
    msg("user", "Stuck in traffic, might be 10 min late for the 7.30 class 😅", at(3, 19, 22)),
    msg(
      "assistant",
      "No worries, traffic happens 🚗 Just so you know, we hold a 15-min buffer for all classes — so as long as you're in within 15 mins of the start, you're good to join. If it's looking longer than that, drop us a message and we'll help you sort another slot 🙏",
      at(3, 19, 22)
    ),
    msg("user", "Made it 🙏", at(3, 19, 33)),
  ]),
];
