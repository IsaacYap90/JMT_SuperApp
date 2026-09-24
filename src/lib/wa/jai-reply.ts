// JAI (JMT AI assistant) reply logic — ported from the standalone jai-bot into JMT OS.
// Uses DeepSeek (OpenAI-compatible) over plain fetch (no extra dependency).
//
// Facts come from the live jai_facts row; jai-facts.ts is fallback only.
// This file holds Jai's voice, rules, and escalation logic.

import { getJaiFacts } from "./jai-facts";
import {
  validateReply,
  describeViolations,
  statesAClassTime,
  daysNamedIn,
  looksNonEnglish,
  isLateArrivalReply,
  offersAPhoneCall,
  claimsACutoffTime,
  checkDayBinding,
  indexSchedule,
  JMT_FACT_GUARD_CONFIG,
  type FactCheckResult,
} from "./fact-guard";
import { buildDeterministicAnswer, scheduleAnswerForDay } from "./deterministic-answers";
import { FACT_GUARD_BLOCK_TEXT } from "./join-intent";
import { isStubbedLlm, stubbedLlmReply } from "./harness";

const SYSTEM_PROMPT = `You are Jai, Coach Jeremy's assistant at Jai Muay Thai (JMT), a Muay Thai gym in Ang Mo Kio, Singapore. You help prospects and members over WhatsApp.

## IDENTITY & VOICE
- Your name is "Jai" — Jeremy's assistant. Introduce yourself as "I'm Jai, Coach Jeremy's assistant."
- Speak casually and warmly. Answer first, usually in 1–3 short sentences. Match the customer's language and level of formality without forcing slang. Usually no emoji; at most one when natural.
- Don't announce your AI identity unprompted. If asked whether you are AI, automated, or a real person, answer clearly: "Yes, I'm JMT's AI assistant. Would you prefer to speak with Coach Jeremy?" Never imply you are human or dodge the question by only saying "assistant". Offering a choice is not a handoff; if they request Jeremy, include the appropriate escalation.

## RULE — ANSWER ONLY FROM THE FACT SHEET
- You must ONLY use the facts in the FACT SHEET below. It is your single source of truth for the gym's location, hours, classes, schedule, prices, trials, PT, freeze policy, what-to-bring and coaches.
- If a question isn't covered by the FACT SHEET, do NOT guess and do NOT use outside/general knowledge — tell them you'll check with Coach Jeremy and escalate (see ESCALATION).
- Never invent prices, schedules, links, ages, or policies. When unsure → escalate, don't guess.

## SCOPE
- You mainly handle GROUP CLASSES: schedule, pricing, free trials, what to bring, beginner questions, location. You answer the STANDARD rates from the FACT SHEET, but you do NOT handle discounts/promos or sign-up — that is Coach Jeremy's (see MONEY & JOINING below).
- Personal Training (PT) is handled by Coach Jeremy directly. You MAY share the PT starting price from the FACT SHEET if asked, but you do NOT quote exact PT packages/tiers or book PT — take their details and hand off to Jeremy.
- Anything you can't answer from the FACT SHEET → hand off to Jeremy.

## PARENT + CHILD / "TRAIN TOGETHER" → THIS IS A PT LEAD, NOT A GROUP-CLASS QUESTION (HIGH PRIORITY)
When a lead signals they want to train TOGETHER with their child or family — e.g. "parent and child class", "train with my kid/son/daughter", "a class for me and my child", "1:2", "1-to-2", "together", "can we do it together", "join with my son/daughter" — treat it as a PRIVATE TRAINING (PT) lead, NOT a group-class enquiry. This overrides the default "you mainly handle group classes" scope.
- Do NOT lead with, list, or explain the separate Kids/Pre-Teen and adult group classes. Those run as SEPARATE classes (different times, different groups) — answering a "train together" question with the separate group classes is exactly the wrong move.
- Instead, PROACTIVELY offer the 1:2 private-together option, e.g.: "A lot of parents actually do a 1:2 private session so you can train together with your child 🥊 — want me to set that up?"
- Do NOT quote ANY price for the 1:2 / parent-child session — you do NOT have it. Coach Jeremy prices and arranges the 1:2 personally. Do NOT use the solo PT-trial figure ($50–60) here — that is for a single person only, not the parent-child 1:2. If they ask the cost, say Coach Jeremy will go through it with them.
- The MOMENT they show interest in the 1:2 / together option, STOP selling. Do NOT run the standard PT qualifying questions. Reply briefly — "Perfect — let me get Coach Jeremy to lock this in for you 🙏 He'll reach out to you shortly." — and hand STRAIGHT to Coach Jeremy with a PT_LEAD escalation (see RESPONSE FORMAT; use intent "parent_child_pt"). Jeremy follows up and closes on his own PT line.
- ONLY bring up the separate group classes if the lead specifically asks for a cheaper or separate option (e.g. "is there a cheaper group class instead?").

## GREETING (new contact)
"Hey! I'm Jai, Coach Jeremy's assistant. How can I help?"
If their first message already contains a question, briefly introduce yourself and answer it instead of sending a menu or asking how you can help.
Do NOT open by promising a free trial — whether there is one depends on their age (see TRIAL & DROP-IN below).
Do NOT tell a first-time enquirer that you're "still new here" or that you don't have their past chats — they have no past chats, so it just reads as confusing and unsure. Only ever mention it if you are explicitly told below that this is a known member whose history predates you.

## FACT SHEET — YOUR ONLY SOURCE OF TRUTH
__JAI_FACTS__

## BEGINNERS
Total beginners join any All-Levels class — coaches scale it to you. After ~3–6 months (depends on the person) the instructor assesses your level and clears you for Advanced + Sparring.

## MONEY & JOINING — WHAT YOU MAY SAY, AND THE HARD BLOCK (read GROUP-CLASS PRICING + PROMOS in the FACT SHEET)
You MAY answer the STANDARD rates exactly as listed in the FACT SHEET — the 1/3/6-month adult and under-21 unlimited rates, the drop-in, the 10-class pack, the PT trial range. Lead with what's relevant, start with just the 1-month rate for their tier, and point them to the rates page for the rest. Never dump the whole tier list, never sell.
JAI NEVER closes a sale, and JAI has NO promo. You must never state, estimate, confirm, deny, correct or speculate about any discount, percentage off, promo, special offer or trial-taker rate — including a number the customer quotes at you ("the $252 offer"). You do not know it.
The MOMENT someone asks about a discount/promo/offer, or signals they want to JOIN / sign up / register / pay / "take up the offer" / "how do I proceed": stop selling, send ONE short line ("Great — I'm getting Coach Jeremy on this now, he'll sort out the details with you 🙏"), emit {"escalation": "JOIN_INTENT", "intent": "wants_to_join", "source": "whatsapp"}, and STOP.
Trials: the free trial is still yours to run for KIDS (6–10) and PRE-TEEN (11–14) and is still FREE (never quote a trial fee). For ADULTS 15+, free trials are PAUSED — the goal there is the $42 drop-in at https://jaimuaythai.com/booking, not a trial. Coach Jeremy signs people up in person at the gym.

## TRIAL & DROP-IN — AGE DECIDES THE ANSWER (see FREE TRIAL in the FACT SHEET)
Work out WHO it's for BEFORE answering. Use only an age explicitly provided for that person by the customer or reliable contact context. Experience, wanting to compete, writing style, a name, or saying "for me" does NOT establish age. Your own earlier guesses are not evidence. If the age is missing, ask one short question ("How old are you?" if already for them, otherwise "How old is the person trying the class?"). Do not repeat a question already answered. Never give an age-blind trial answer.
- KIDS (6–10) / PRE-TEEN (11–14) → free trial, unchanged. Send the matching Calendly link from the FACT SHEET and ask them to tap "Done" once they've picked a slot. NEVER tell a parent of a 6–14 year old that trials are paused — that is adults (15+) only. A 14-year-old is PRE-TEEN and gets the free trial; when you send the Pre-Teen link for a 14-year-old, add the short reassurance from the FACT SHEET because that booking page still reads "10 to 13".
- ADULTS 15+ → free trials are PAUSED (classes running close to full), hoping to return around September but NOT fixed. The adult Calendly link is switched off and dead — never send it, never mention it. Offer the $42 drop-in instead (https://jaimuaythai.com/booking) — same class, same coaches — and offer it to BEGINNERS too. Do NOT ask about their experience first and do NOT steer a beginner to a free trial; there isn't one.
- One free trial per person, ever. Never offer or agree to a second trial for someone who already attended theirs.
Say (kids/pre-teen): "Here's the link to book your free trial — just pick a time that works: [link]. Reply "Done" once you've booked and I'll confirm everything 👍". ALWAYS end that message with [QUICK_REPLIES: "Done"] so they get a tappable Done button; the wording still says reply "Done" in case the button doesn't show on their device. After they book, we confirm + send reminders automatically. After the trial, the coach helps them pick a membership in person at the gym (no online payment).
If an ADULT wants to train again after their trial, point them to a membership or the drop-in option ("The free trial is a one-time thing, but you can drop in for a class at $42, or Coach Jeremy can sort you out with a membership at the gym 🙂") — remember, no closing online. If they're UNDER 21, follow the parent rule below instead of pitching prices at them.

## UNDER-21s — PARENT / GUARDIAN RULE
Anyone under 21 (Kids, Pre-Teen, students, NSF) can't sign themselves up — a parent or guardian has to approve and handle payment. This holds even if they say they're working and can pay for themselves ("That's awesome! We'd still just need mum or dad's okay to sign you up — house rule for anyone under 21 🙂") — parental consent is required to sign, no exceptions. Kids and Pre-Teens are usually brought by a parent; sometimes one comes via a friend or an existing member without their parent.
- If you're chatting with the under-21 themselves after their trial: be warm, don't pitch prices or drop-in at them. Ask them to get mum or dad to text us here (or Coach Jeremy) if they're happy for them to sign up — then we sort everything out with the parent.
- If the under-21 ASKS for the price (e.g. to tell their parent): sharing is fine, but keep it to ONE number — the 1-month rate only (e.g. "$250/month for Pre-Teen"), don't list the 3/6-month plans, and never a discount or promo. Still close with "get mum or dad to text us and we'll take care of the rest". The full options are for the parent.
- If the PARENT messages: share the standard pricing per the pricing rules (1-month rate first, no selling, no promos); if the kid hasn't done a trial yet, get that booked; if they have, invite the parent down to the gym — Coach Jeremy handles sign-up in person. If they want to go ahead and sign up, escalate (JOIN_INTENT).
- When booking a Kids or Pre-Teen trial, mention a parent should come along.

## TRIAL — SPECIFIC-TIME & REPEAT ASKS (be smart, never loop, never re-ask)
Read the conversation. Do NOT repeat yourself, and do NOT ask for info you already have — both look dumb.
- If they ask about a SPECIFIC time or day (e.g. "is there a 7:30pm trial?"): answer directly WITH THE REASON — the popular evening classes like 7:30pm are among our BUSIEST, so they're generally not open as free-trial slots (say it, like Coach Jeremy would). Don't just deflect to the link.
- If they still want that specific class, go to the DROP-IN path. Do NOT ask about experience first any more — the $42 drop-in is open to everyone, beginners included. Send the booking link: https://jaimuaythai.com/booking and reassure a beginner that All-Levels is where beginners start and the coaches scale it to them.
   - For a KID (6–10) or PRE-TEEN (11–14), lead with the free trial Calendly link instead — those trials are still running.
- Escalate to Coach Jeremy only as a FALLBACK — if neither a trial nor a drop-in fits what they need. When you do, **USE THE NAME YOU ALREADY HAVE** (you already know it from WhatsApp / you've been addressing them by it) — do NOT ask "what's your name?" again. Just say you're passing their details to Jeremy.
- NEVER send the Calendly link, or the same answer, twice in a row. NEVER re-ask for a name/detail already in the conversation.
- General rule for the WHOLE chat: resolve it yourself with the trial / drop-in paths first; bring in Coach Jeremy as the fallback, not the first move. Repeating a message, or re-asking info you already have, = looking dumb.

## MEMBER BRINGING SOMEONE ELSE FOR A TRIAL (friend / family / brother)
A member can absolutely bring a NEW person along — that guest is a normal first-time prospect, so treat them exactly like any new lead and apply the age rule to the GUEST: a guest aged 6–14 gets the free trial link, a guest aged 15+ gets the paused-trial answer + the $42 drop-in (never the dead adult Calendly link).
- The MOMENT you learn the trial is for someone else (a friend / brother / family member), LOCK it in: that guest is who the trial is for. You already know it's for them — do NOT keep asking "is it for you or a friend?" Ask that AT MOST once, then never again.
- Track the guest as their own person: their experience level is THEIRS, not the member's. Never say "since YOU have experience…" when the member was telling you about the guest.
- Guest is a beginner / first-timer → take the guest's name, then follow the age rule: 6–14 gets the free-trial Calendly link for THEM; 15+ gets the $42 drop-in (adult trials are paused, and being a beginner no longer changes that).
- If the specific day they need has no open slot → do NOT resend the same link. Say it's full, offer the next open day ONCE, and if they must have a day you can't fix, hand to Coach Jeremy WITH the context (who the guest is, their level, the day needed) and stop.

## NEVER LOOP (hard rule — this is what makes you look dumb)
- If you've already sent the Calendly link once in this chat, do NOT send the exact same link again. If they still can't book (e.g. "no slots today" repeated), stop self-serving — hand to Coach Jeremy with full context and STOP replying on it.
- Never ask a question you already asked, and never re-ask info already in the chat (who it's for, their name, their experience). Read the whole conversation first.
- When you say you'll pass something to Coach Jeremy, that's a real handoff: say it once, set the expectation, and STOP — do not immediately re-open the trial/link flow. Saying "I'll pass to Jeremy" then continuing to loop destroys trust (it happened live 2026-07-09).

## TRIAL CANCEL / RESCHEDULE
If someone with a booked trial says they can't make it, wants to cancel, or asks to change the time: be warm, zero guilt ("No worries at all — things come up!"). Rebooking a cancelled trial is fine — the trial is unused.
- KIDS (6–10) / PRE-TEEN (11–14) → offer to rebook right away: resend the Calendly link for their age group so they pick a new slot (same flow as booking, including the Done button).
- ADULT trial already booked before the pause → their adult Calendly link is switched off, so you CANNOT rebook them. Do NOT send a link. Be warm, tell them Coach Jeremy will sort a new slot out with them personally, and hand it to him. Still emit the JSON block below so their old slot is released. Someone who already ATTENDED their trial does not get another one (see the one-trial rule above).
MANDATORY: every reply in a cancel/reschedule situation MUST end with this exact JSON block — it is how the gym releases their old booking; without it their slot stays blocked and reminders keep firing. This applies even when they only cancel and don't rebook:
{"escalation": "TRIAL_CANCEL", "intent": "reschedule_or_cancel", "source": "whatsapp"}

## TONE EXAMPLES
Good ✅: "Yes, beginners can join All-Levels. The coaches adapt the training to your level."
Bad ❌: "Thank you for your enquiry. Our class schedule is as follows…" / "As an AI assistant, I can provide…"

## COMMON SITUATIONS
- "No experience, is that ok?" → "Totally! Most of our members started at zero. Join an All-Levels class — coaches guide you step by step."
- "Is it dangerous?" → Do not guarantee safety or volunteer a free trial. Answer only what the fact sheet supports; otherwise check with Coach Jeremy and escalate.
- "Women's classes?" → "All classes are mixed and super supportive — lots of female members. Come try it!"
- "Can I pause/freeze/hold my membership?" → We offer a freeze of minimum 2 weeks, for medical reasons or overseas travel. Say: "We can definitely freeze your membership 🙏 Minimum 2 weeks, for medical reasons or when you're travelling overseas. Can I grab the reason and rough dates? I'll pass it to Coach Jeremy to set it up for you." Gather the reason + rough dates, then escalate to Jeremy with that context. State the policy but NEVER approve the freeze yourself or promise a date — only Jeremy can action it (Glofox admin).
- Just "Hi" → use the greeting.
- Something you don't know → "Good question — let me check with Coach Jeremy and get back to you. Anything else in the meantime?" then escalate.

## EXISTING MEMBERS — NOT new leads (never send them the trial link)
The free-trial Calendly link is ONLY for brand-new prospects booking their FIRST trial. If someone is already a MEMBER — they mention "my membership", "I'm a member", the Glofox app, renewing, billing, "book my class", "I train here", "my plan" — do NOT treat them as a new lead and do NOT send the trial Calendly link.
- Members book their classes in the Glofox app, not through us. If a member CAN'T book a class, or has any membership / app / billing problem → that's Coach Jeremy's side (he runs Glofox admin). Get a one-line detail of the issue, then escalate to Jeremy — do NOT send Calendly, do NOT ask "is it a trial or a drop-in?".
- Once you realise they're a member, STAY in member mode for the rest of the chat — never flip back to the trial/lead flow or re-offer the trial link.

## ESCALATION (hand off to Coach Jeremy)
Hand off — say "Let me get Coach Jeremy to help with that directly 🙏", set the expectation ("he'll reach out shortly"), and flag it with full context — when:
- They want Personal Training (pass name + what they want).
- They want to train TOGETHER with their child / family (parent+child, "1:2", "together") AND show interest in the 1:2 option — PT_LEAD escalation (intent "parent_child_pt"); brief handoff line, no group-class pitch, no price. See the PARENT + CHILD section above.
- They want to JOIN / sign up / register / pay, or they ask about a discount, promo, special offer or a price you don't have — JOIN_INTENT escalation, one short line, no promo figures, no selling. See MONEY & JOINING above.
- A complaint, dispute, refund, injury, or membership pause/freeze/cancellation (only Coach Jeremy can pause a membership — he handles it from the Glofox admin side).
- Corporate / group / event / sponsorship / media enquiries.
- Discount requests or custom deals.
- Anything you can't answer confidently from the facts above.
- Someone clearly wants PERSONAL guidance / a tailored plan — they open up about their situation (goals, shift-work schedule, fitness or health background, budget worries; e.g. "help me figure out my goals", "train me from scratch"). Do NOT write a long generic breakdown of classes/PT. Give a SHORT warm reply (a line or two acknowledging them) and hand straight to Coach Jeremy, who'll give them real 1-on-1 guidance. Over-explaining makes it feel automated — the human touch matters here.
Never invent prices, schedules, or policies. When unsure → escalate, don't guess. Never share coaches' personal numbers or internal business matters.

## RESPONSE FORMAT RULES
When you need to escalate, include a JSON block:
{"escalation": "TYPE", "intent": "intent_value", "source": "source_value"}
Types: PT_LEAD, JOIN_INTENT, CORPORATE, COMPLAINT, TRIAL_BOOKED, TRIAL_CANCEL, GENERAL_ESCALATION

WhatsApp formatting: for bold use *single asterisks* (WhatsApp style), NEVER markdown **double asterisks** — they show up as literal stars to the customer.

If the person is clearly an EXISTING MEMBER — they talk about their CURRENT membership (freeze, renewal, billing, their plan, "I renewed already", "my class", attendance, being away next week) rather than enquiring like a brand-new prospect — add this exact tag on its own line: [MEMBER]

For quick reply buttons:
[QUICK_REPLIES: "Option 1", "Option 2", "Option 3"]`;

// The ONLY escalation types the system acts on. The model is prompt-injectable
// (customer text flows into it), so anything outside this set is dropped before
// it can drive alerts / auto-cancel / Jeremy's alert text.
export const ESCALATION_TYPES = [
  "PT_LEAD",
  // Wants to buy / join / pay. The ONLY escalation type that also pauses JAI on
  // the chat — money conversations are Jeremy's (Isaac, 2026-07-29).
  "JOIN_INTENT",
  "CORPORATE",
  "COMPLAINT",
  "TRIAL_BOOKED",
  "TRIAL_CANCEL",
  "GENERAL_ESCALATION",
] as const;
export type EscalationType = (typeof ESCALATION_TYPES)[number];

export type Escalation = { escalation: string; intent?: string; source?: string };

export type ParsedReply = {
  messageText: string;
  escalation: Escalation | null;
  quickReplies: string[];
  member: boolean;
};

// Pull the optional escalation JSON block + quick-reply directive out of the raw
// model text, leaving a clean message for the customer.
export function parseResponse(rawText: string): ParsedReply {
  let messageText = rawText;
  let escalation: Escalation | null = null;
  let quickReplies: string[] = [];

  // Existing-member signal — the model emits a bare [MEMBER] tag when the person
  // is clearly an existing member (talks about their current membership).
  let member = false;
  if (/\[MEMBER\]/i.test(messageText)) {
    member = true;
    messageText = messageText.replace(/\[MEMBER\]/gi, "").trim();
  }

  const jsonMatch = rawText.match(/\{[\s\S]*?"escalation"\s*:\s*"[^"]+?"[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as Escalation;
      // Only accept a known escalation type. An attacker-controlled string (via
      // prompt injection) is discarded so it can't reach Jeremy's alert or the
      // TRIAL_CANCEL auto-cancel path.
      escalation =
        parsed && (ESCALATION_TYPES as readonly string[]).includes(parsed.escalation)
          ? parsed
          : null;
      messageText = messageText.replace(jsonMatch[0], "").trim();
    } catch {
      /* malformed JSON — ignore */
    }
  }

  const qrMatch = messageText.match(/\[QUICK_REPLIES:\s*(.+?)\]/);
  if (qrMatch) {
    quickReplies = qrMatch[1]
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean)
      .slice(0, 3);
    messageText = messageText.replace(qrMatch[0], "").trim();
  }

  // Deterministic guards — the model is told to do both of these but skips
  // them often enough that customers noticed (2026-07-02 live test):
  // 1. Markdown **bold** renders as literal stars on WhatsApp; fold to *bold*.
  messageText = messageText.replace(/\*\*(.+?)\*\*/g, "*$1*");
  // 2. Every booking-link message must carry the tappable Done button.
  if (quickReplies.length === 0 && /calendly\.com\//i.test(messageText)) {
    quickReplies = ["Done"];
  }

  messageText = messageText.replace(/\n{3,}/g, "\n\n").trim();
  return { messageText, escalation, quickReplies, member };
}

type HistoryMsg = { role: "user" | "assistant"; message: string };

// WhatsApp display names are often dressed up with emojis/symbols, e.g.
// "★ ·.° 🎏 huiqing ·.° ★ ·✨". Naively taking the first whitespace token gives
// "★". Pull the first token that's an actual name (≥2 letters), stripping
// leading/trailing decoration, so JAI greets them by their real name.
// Letter ranges cover latin + accented + CJK + kana + hangul (no \p{L}/u flag,
// which the project's TS target rejects).
const NAME_LETTERS = "A-Za-z\\u00C0-\\u024F\\u4E00-\\u9FFF\\u3040-\\u30FF\\uAC00-\\uD7AF";
export function firstNameFrom(name?: string | null): string {
  if (!name) return "";
  const edge = new RegExp(`^[^${NAME_LETTERS}]+|[^${NAME_LETTERS}]+$`, "g");
  const letter = new RegExp(`[${NAME_LETTERS}]`, "g");
  for (const token of name.trim().split(/\s+/)) {
    const cleaned = token.replace(edge, "");
    if ((cleaned.match(letter) || []).length >= 2) {
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }
  }
  return "";
}

// ── Model providers ────────────────────────────────────────────────────────
// DeepSeek 503'd for real on 2026-08-04 ("Service is too busy… switch to
// alternative LLM API service providers") and every customer got the canned
// apology. So: primary → fallback → apology, never primary → apology.
//
// Gemini is reached through its OpenAI-COMPATIBLE endpoint on purpose: the
// message array (system prompt + history) is handed over byte-identical, so
// JAI's persona, fact sheet and guardrails cannot drift between the two paths.
// A different provider, not just a different DeepSeek model — a same-provider
// fallback would have been down in the same outage.
//
// All three are reasoning models that burn max_tokens on thinking and return an
// empty string unless it is disabled (see reference_deepseek_v4_migration):
// DeepSeek needs thinking:{type:"disabled"}, Gemini needs reasoning_effort
// (it rejects "none" with a 400, so "low" is the floor), Nemotron needs an
// explicit small reasoning_budget (its default is 16384 — the whole reply).
type Provider = {
  name: string;
  url: string;
  apiKey: string | undefined;
  timeoutMs: number;
  body: (messages: unknown[]) => Record<string, unknown>;
};

const PROVIDERS: Provider[] = [
  {
    name: "deepseek",
    url: "https://api.deepseek.com/chat/completions",
    apiKey: process.env.DEEPSEEK_API_KEY,
    // A customer waiting 30s is its own failure — cut over early. Healthy
    // DeepSeek answers in 1–4s. The overall cap across all tiers is
    // CHAIN_BUDGET_MS below, not the sum of these per-provider timeouts.
    timeoutMs: 8_000,
    body: (messages) => ({
      model: "deepseek-v4-flash",
      max_tokens: 500,
      thinking: { type: "disabled" },
      messages,
    }),
  },
  {
    name: "gemini",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    apiKey: process.env.GEMINI_API_KEY,
    timeoutMs: 12_000,
    body: (messages) => ({
      model: "gemini-flash-latest",
      // Gemini's reasoning tokens come OUT of max_tokens and cannot be fully
      // switched off, so 500 (DeepSeek's budget) truncates the reply mid-
      // sentence. Headroom, not a longer answer — the prompt still says short.
      max_tokens: 1500,
      reasoning_effort: "low",
      messages,
    }),
  },
  {
    // Last resort. NVIDIA's build.nvidia.com is a FREE PROTOTYPE tier — no SLA,
    // rate-limited, throttleable — so it sits below Gemini deliberately. It is
    // still strictly better than the apology: a third independent vendor means
    // DeepSeek and Google would both have to be down before a customer gets
    // nothing. Also OpenAI-compatible, so the prompt stays byte-identical.
    name: "nemotron",
    url: "https://integrate.api.nvidia.com/v1/chat/completions",
    apiKey: process.env.NVIDIA_API_KEY,
    // Measured 2026-08-05 on the real prompt: 4.1s / 7.1s / 7.8s and one
    // timeout at 8s. The free tier is simply slower and more variable than the
    // paid two, and this is the LAST tier — the alternative to waiting is the
    // apology, so give it room. CHAIN_BUDGET_MS still caps the total.
    timeoutMs: 10_000,
    body: (messages) => ({
      model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
      max_tokens: 1500,
      // Thinking cannot be switched off, only budgeted. 512 is enough for a
      // short factual reply and leaves the rest of max_tokens for the answer;
      // the default 16384 would swallow it and return empty content.
      reasoning_budget: 512,
      temperature: 0.6,
      top_p: 0.95,
      messages,
    }),
  },
];

// The WhatsApp webhook is capped at maxDuration = 30 (see its route.ts), and
// that budget covers the Supabase reads and the WA send too, not just this
// call. Three providers at their full individual timeouts would be 8+12+10 =
// 30s on their own, so the chain runs against a WALL-CLOCK DEADLINE: each
// provider gets whatever is left, and one that cannot get a fair shot is
// skipped rather than started and guillotined. A fourth tier cannot overrun it.
//
// The budget is NOT "whatever fits under 30 on its own" — this deadline starts
// INSIDE completeWithFallback, so everything the webhook does around it is
// outside the clock and still counts against maxDuration: BEFORE generateReply,
// ~8 Supabase round-trips plus an awaited Telegram send; AFTER it, the WA send,
// up to 2 more Telegram sends, ~6 more queries and a possible live Calendly
// call. That surrounding work measures ~4.5–7.5s. At 24s the platform could kill
// the request in the window between the WA send and markHandled() — and dedup
// fails OPEN by design, so Meta re-delivers and the customer gets a SECOND copy
// of the same reply, repeatably. 18s leaves ~12s of headroom, which covers the
// slow end of that surrounding work.
//
// Accepted trade: if BOTH paid tiers hang to their full timeouts (8+12 = 20s >
// 18s) Nemotron is skipped and the customer gets the apology. A duplicate
// message to a real customer is worse than the apology, and the case that
// actually matters is the common one — a provider that FAILS fast (503/401 in
// well under a second) leaves nearly the whole budget for the next tier.
const CHAIN_BUDGET_MS = 18_000;
// Below this there is no point starting a provider — it would time out mid-
// flight and burn the remaining budget for nothing.
const MIN_ATTEMPT_MS = 2_500;

// Try each configured provider in turn. Returns the first non-empty completion,
// or "" if they all fail — "" is what makes generateReply send the canned
// apology, so reaching the end of this loop is the thing worth avoiding.
// EVERY failure falls through to the next tier (see the !res.ok branch below).
async function completeWithFallback(messages: unknown[]): Promise<string> {
  // Harness only — never reachable on Vercel (see harness.ts). Everything the
  // webhook does AROUND the model still runs; only the provider call is faked.
  if (isStubbedLlm()) return stubbedLlmReply();
  const deadline = Date.now() + CHAIN_BUDGET_MS;
  for (const p of PROVIDERS) {
    if (!p.apiKey) continue;
    // Never let a later tier overrun the webhook's own duration cap.
    const budgetLeft = deadline - Date.now();
    if (budgetLeft < MIN_ATTEMPT_MS) {
      console.error(`[jai-reply] out of time before ${p.name} (${budgetLeft}ms left)`);
      break;
    }
    const timeoutMs = Math.min(p.timeoutMs, budgetLeft);
    try {
      const res = await fetch(p.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${p.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(p.body(messages)),
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        // Fall through on EVERY failure, 4xx included. This used to bail out of
        // the whole chain on a 4xx ("our bug, it would repeat elsewhere") — but
        // that is only true of a bad prompt, which is shared. Auth and request
        // shape are NOT shared: each provider has its own key and its own body.
        // So one expired DEEPSEEK_API_KEY would 401 and send every customer the
        // apology while two healthy providers sat unused. A genuinely shared
        // bug still fails all three and still ends in "" — same outcome, one
        // deadline-bounded chain later.
        console.error(`[jai-reply] ${p.name} error`, res.status, await res.text().catch(() => ""));
        continue;
      }
      const data = await res.json();
      const text: string = data?.choices?.[0]?.message?.content ?? "";
      // Empty-but-200 is the reasoning-token trap; treat it as a failure so the
      // next provider gets a go rather than shipping a blank message.
      if (!text.trim()) {
        console.error(`[jai-reply] ${p.name} returned empty content`);
        continue;
      }
      console.log(`[jai-reply] served by ${p.name}`);
      return text;
    } catch (err) {
      console.error(`[jai-reply] ${p.name} failed`, err);
    }
  }
  return "";
}

// What the customer gets when there is no usable model text — either every
// provider failed, or the reply parsed down to nothing. One line, no promise.
const APOLOGY_TEXT = "Hey! Sorry, having a quick issue. Bear with me 🙏";

// Build JAI's prompt, call the model chain, and return the parsed reply.
export async function generateReply(
  history: HistoryMsg[],
  isNewContact: boolean,
  customerName?: string | null,
  isMember?: boolean,
  contactContext?: string
): Promise<ParsedReply> {
  // Facts are pulled live from the DB (with the in-code JAI_FACTS as fallback),
  // so a fact can be edited with no deploy. Injected per-message here, not baked
  // into SYSTEM_PROMPT at import time.
  // Replacement FUNCTION, not a string: the fact sheet is DB-authored free text
  // full of "$42"/"$280", and String.replace would interpret $& $` $' $$ in a
  // string replacement — a "$'" typed into the sheet would splice the prompt
  // into itself. A function replacement disables all of that.
  const jaiFacts = await getJaiFacts();
  let systemPrompt = SYSTEM_PROMPT.replace("__JAI_FACTS__", () => jaiFacts);
  // Who JAI is actually talking to (member / returning / new) + any recap, so it
  // greets appropriately instead of defaulting to the brand-new greeting.
  if (contactContext && contactContext.trim()) {
    systemPrompt += `\n\n## WHO YOU'RE TALKING TO (use this — do not contradict it)\n${contactContext.trim()}`;
  }
  // Give JAI the real current date/time in SINGAPORE (SGT, UTC+8) so "today / tomorrow /
  // tonight / this week / what day" is always correct — never let the model guess the date.
  const nowSgt = new Date().toLocaleString("en-SG", {
    timeZone: "Asia/Singapore",
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
  systemPrompt += `\n\n## CURRENT DATE & TIME (Singapore, SGT)\nRight now in Singapore it is ${nowSgt}. Use Singapore time (SGT, UTC+8) for ALL date/day reasoning ("today", "tomorrow", "tonight", "this week", "what day is it"). Work out tomorrow's day from THIS — never guess. Group classes run Mon–Sat; Sunday is PT only.`;
  const firstName = firstNameFrom(customerName);
  if (firstName) {
    systemPrompt += `\n\nThe customer's first name is "${firstName}". Address them by it naturally — especially in the greeting (e.g. "Hey ${firstName}!"). Don't overuse it or repeat it every message. Never greet them using an emoji or symbol as if it were their name.`;
  }
  if (isMember) {
    systemPrompt += `\n\nThis contact is a KNOWN EXISTING MEMBER${firstName ? ` (${firstName})` : ""}. Greet them warmly as a member — do NOT pitch the free trial or quote new-joiner prices. For membership admin (renewal, freeze, billing, plan changes) gather brief details and hand to Coach Jeremy.`;
  }
  if (isMember && isNewContact) {
    // Known member, but this is the first message we have from them in this
    // thread — their history with the gym genuinely predates JAI. This is the
    // ONE case where "I may not have your past details yet" makes sense.
    systemPrompt +=
      `\n\nThis is a KNOWN MEMBER${firstName ? ` (${firstName})` : ""} but it's the first message we have from them in this WhatsApp thread — their history with the gym predates you. ` +
      `Greet them warmly as a member. You MAY note once, briefly, that you're Coach Jeremy's new assistant here so you might not have all their past details yet — once only, never again after this message.`;
  } else if (isNewContact) {
    systemPrompt += "\n\nThis is a NEW contact messaging for the first time. Use the greeting flow" + (firstName ? `, greeting ${firstName} by name.` : ".") + " They have NO history with us, so never say you don't have their past chats — there are none.";
  } else {
    // Returning contact OR known member we've already spoken to in this thread.
    systemPrompt +=
      `\n\nThis is NOT a brand-new contact — you have spoken before or they are a known member. ` +
      `Do NOT use the "I'm still new here, so I don't have your past chats" line (or any variation), and NEVER claim to be new or to lack their history. ` +
      `Greet them as someone you already know${firstName ? ` — by name ("Hey ${firstName}!")` : ""}, and pick up the conversation naturally.`;
  }

  // Apply after the live sheet and contact context: older templates may be
  // wordy or imply an age. This controls delivery, never gym facts or guards.
  systemPrompt += `\n\n## FINAL CONVERSATION RULES
These rules override conflicting tone, greeting, identity, or sales-copy examples above, including examples in the fact sheet. The live fact sheet remains authoritative for gym facts and policies. Keep all required escalation JSON, booking directives, and safety rules.
- Answer the customer's actual question first. Usually use 1–3 short sentences; use more only for requested detail or necessary policy information. Do not truncate a useful answer merely to meet a sentence limit.
- Match their language and level of formality. No marketing paragraphs, forced enthusiasm, repeated names, or routine emoji. Do not append a booking link, menu, or follow-up question to every answer. Ask one question only when needed to resolve their request; share a link when it answers their question or they want to book.
- Never reframe a paid option as better for them (for example, "for a competitor, that's honestly the better first step anyway"). Give the applicable verified policy and price plainly, without pressure or invented benefits.
- Do not infer age, eligibility, class clearance, or fight readiness from years of experience or competition goals. For an age-dependent trial answer, establish the intended participant's age from their explicit statement or reliable contact context first. If missing, ask their age without quoting an age-specific offer. Do not ask again when already known. An earlier assistant assumption is not evidence.
- For example, after "I have two years of experience and want to compete", "how much is a trial?" still requires an age question if no age was provided. A coach assesses class clearance and fight readiness; do not promise either.
- If asked "is this AI?" or whether you are human, explicitly say you are JMT's AI assistant in their language. Offer Coach Jeremy as a choice without claiming a handoff has happened. If they ask for a human, follow the escalation rules. Never answer merely "I'm JMT's assistant" or claim to know everything.
- Facts, prices, availability, and policies must come from the live fact sheet, not an old example or a previous assistant reply. If a fact is missing, check with Coach Jeremy using the escalation rules.`;

  const messages: ChatMsg[] = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.message })),
  ];

  // What the CUSTOMER themselves wrote (recent turns). A time/price from here
  // may be echoed back inside a correcting sentence without being blocked —
  // "we don't have a 7pm class, closest is 6:30-7:30pm" must still be sendable.
  // Only USER turns are trusted; trusting past assistant turns would let one
  // bad draft legitimise the next.
  const lastCustomerMsg = history
    .filter((m) => m.role === "user")
    .slice(-5)
    .map((m) => m.message)
    .join("\n");

  const text = await completeWithFallback(messages);
  if (!text) {
    console.error("[jai-reply] all providers failed — sending canned apology");
    return { messageText: APOLOGY_TEXT, escalation: null, quickReplies: [], member: false };
  }

  let parsed = parseResponse(text);

  // ── TIMETABLE CLAIMS ARE NOT THE MODEL'S TO MAKE ──────────────────────────
  // If the draft states a day and a time, we do not grade it — we replace it
  // with an answer built from the sheet. Grading was a blacklist and it never
  // converged (three e2e rounds, six evasions, and nothing covering Chinese or
  // Malay). Substitution has nothing to evade: the sentence the customer reads
  // is generated from the sheet, so it cannot disagree with it.
  //
  // The customer still gets a real answer, not a deflection — which is why the
  // detector above can afford to be greedy.
  if (statesAClassTime(parsed.messageText)) {
    const lastUser = [...history].reverse().find((m) => m.role === "user")?.message ?? "";

    // An escalation means this reply is doing something other than quoting a
    // timetable — cancelling a trial, handing a buy signal to Jeremy. Replacing
    // the text would tell the customer nothing about the action we just took:
    // e2e found a child's trial cancelled and Jeremy pinged while the parent was
    // asked which day they meant. Leave those to the fact guard below, which
    // still checks every time and price in them.
    if (parsed.escalation) {
      console.error(
        "[jai-reply] timetable claim inside an escalation reply — guarding, not replacing",
        JSON.stringify({ escalation: parsed.escalation.escalation })
      );
    } else if (isLateArrivalReply(parsed.messageText) || isLateArrivalReply(lastUser)) {
      // Not a timetable answer — a cutoff answer. Replacing it with a class list
      // throws away the reply the customer actually needs.
      console.error("[jai-reply] late-arrival reply — guarding, not replacing");
    } else if (looksNonEnglish(parsed.messageText) || looksNonEnglish(lastUser)) {
      // The canned answers are English. The fact sheet tells JAI to mirror the
      // lead's language, so answering a Chinese enquiry with English copy trades
      // one wrong answer for another. Guard it instead.
      console.error("[jai-reply] non-English timetable claim — guarding, not replacing");
    } else if (checkDayBinding(parsed.messageText, indexSchedule(jaiFacts)).length === 0) {
      // Every day/time pair the draft asserts checks out against the sheet, so
      // there is nothing to correct — keep the model's own words.
      //
      // Replacing unconditionally was costing the front desk more than it
      // protected. Round 7: a correct whole-week answer was swapped for
      // Monday's list on a Tuesday, and a customer who had just answered JAI's
      // own question ("Me | 30") was asked which day they meant. The customer
      // does not care that the facts were verified; they notice that their
      // question went unanswered.
      //
      // Substitution stays for the case it was built for — a draft whose times
      // do NOT check out — so an invented class can still never be sent.
      console.error("[jai-reply] timetable claim verified against the sheet — keeping the reply");
    } else {
      // Prefer the day the conversation ALREADY names — the draft first, then
      // the customer's own words. Only ask when nothing anywhere names a day.
      // Re-running intent detection here was the bug: it is tuned to return null
      // freely (safe for the Layer 2 intercept, where null means "let the AI
      // answer"), so a customer who wrote "can I come Monday at 7:30pm?" got
      // asked which day they meant — twice, and again when they tapped the
      // fallback's own Today button.
      const day = daysNamedIn(parsed.messageText)[0] ?? daysNamedIn(lastUser)[0] ?? null;
      const det = day
        ? scheduleAnswerForDay(day, jaiFacts)
        : buildDeterministicAnswer(lastUser, jaiFacts);
      if (det) {
        console.error(
          "[jai-reply] TIMETABLE CLAIM replaced with the sheet-built answer —",
          JSON.stringify({ day, draft: parsed.messageText, sent: det.messageText })
        );
        return {
          messageText: det.messageText,
          escalation: parsed.escalation,
          quickReplies: det.quickReplies,
          member: parsed.member,
        };
      }
      // Nothing named a day and nothing could be built. Asking is now honest:
      // the customer genuinely has not said which day.
      console.error(
        "[jai-reply] TIMETABLE CLAIM, no day anywhere — asking —",
        JSON.stringify({ draft: parsed.messageText, question: lastUser })
      );
      return {
        messageText: "Happy to give you exact times — which day were you thinking of? 🙂",
        escalation: parsed.escalation,
        quickReplies: ["Today", "Tomorrow"],
        member: parsed.member,
      };
    }
  }

  // JAI has no phone. A reply that offers a call, or tells the customer to ring
  // in, is replaced outright — the sheet already forbade this and the model did
  // it anyway on 1 Sep, handing the warmest lead of the day a number to dial
  // herself. Ask what it is about first, so Coach Jeremy is not calling blind.
  if (offersAPhoneCall(parsed.messageText)) {
    console.error(
      "[jai-reply] reply offered a phone call — replacing —",
      JSON.stringify({ draft: parsed.messageText })
    );
    return {
      messageText:
        "I can't make or take calls myself \u2014 but Coach Jeremy can give you a ring 🙏 What's it about, so I can pass it to him with the details?",
      // This reply PROMISES a call, so it must raise one. Carrying the draft's
      // escalation through meant null on a call-offering draft: the one path
      // built to stop "warmest lead of the day and nobody was told" ended in
      // exactly that.
      escalation: parsed.escalation ?? {
        escalation: "GENERAL_ESCALATION",
        intent: "call_requested",
        source: "guard",
      },
      quickReplies: [],
      member: parsed.member,
    };
  }

  // The model does not get to do cut-off arithmetic in prose. It has stated the
  // boundary backwards twice now, most recently telling a customer "the latest
  // you can join is 6:45pm" for a 6:30pm class. The rule itself is short and
  // unambiguous, so state it and let the deterministic intercept handle a
  // specific arrival time.
  if (claimsACutoffTime(parsed.messageText)) {
    console.error(
      "[jai-reply] prose cut-off claim — replacing —",
      JSON.stringify({ draft: parsed.messageText })
    );
    return {
      messageText:
        "We hold a hard 15-minute cut-off \u2014 if you're less than 15 minutes late you can still join, but 15 minutes or more and we'd have to get you into another class 🙏 Tell me the class and what time you'd arrive and I'll check it for you.",
      escalation: parsed.escalation,
      quickReplies: [],
      member: parsed.member,
    };
  }

  // ── FACT GUARD (layer 1) ──────────────────────────────────────────────────
  // The model is told to quote the fact sheet exactly and has invented class
  // times twice in production anyway. Check the DRAFT before it goes out.
  // Validate against `jaiFacts` — the sheet that was actually injected into
  // this prompt — NOT the in-code constant, or a fact Isaac adds in the DB
  // would be blocked as invented.
  let check: FactCheckResult = guard(parsed.messageText, lastCustomerMsg, jaiFacts);
  if (!check.ok) {
    console.error(
      "[jai-reply] FACT GUARD blocked draft 1 —",
      describeViolations(check.violations),
      JSON.stringify({ violations: check.violations, reply: parsed.messageText })
    );
    // Regenerate ONCE, naming the offending tokens. Retry goes through the same
    // provider chain, so a guard retry keeps the fallback + budget behaviour.
    const retryText = await completeWithFallback([
      ...messages,
      { role: "assistant", content: text },
      { role: "user", content: correctionPrompt(check) },
    ]);
    if (!retryText) {
      // The guard already caught the model inventing a fact, and now the retry
      // could not run. Keep the ESCALATION: without it the customer gets the
      // apology and Jeremy is never told, so a lead who asked the one question
      // we got wrong is dropped silently. (Found in e2e, 2026-09-01.)
      console.error("[jai-reply] guard retry: all providers failed — apology + escalation");
      return {
        messageText: APOLOGY_TEXT,
        escalation: {
          escalation: "GENERAL_ESCALATION",
          intent: "fact_guard_block_no_retry",
          source: "whatsapp",
        },
        quickReplies: [],
        member: false,
      };
    }
    const retried = parseResponse(retryText);
    check = guard(retried.messageText, lastCustomerMsg, jaiFacts);
    if (!check.ok) {
      console.error(
        "[jai-reply] FACT GUARD blocked draft 2 (retry) — escalating —",
        describeViolations(check.violations),
        JSON.stringify({ violations: check.violations, reply: retried.messageText })
      );
      // Never send an invented fact. Hand the customer to Jeremy through the
      // EXISTING escalation mechanism — the webhook Telegram-alerts on it.
      return {
        messageText: FACT_GUARD_BLOCK_TEXT,
        escalation: {
          escalation: "GENERAL_ESCALATION",
          intent: "fact_guard_block",
          source: "whatsapp",
        },
        quickReplies: [],
        member: parsed.member,
      };
    }
    parsed = retried;
  }

  // The provider-level !text.trim() check above sees the RAW text. parseResponse
  // THEN strips the escalation JSON and the [QUICK_REPLIES:…] directive, so a
  // reply made up of ONLY those leaves messageText === "" — and the prompt
  // ACTIVELY DEMANDS a bare escalation block on cancel/reschedule ("MANDATORY:
  // every reply … MUST end with this exact JSON block"). The webhook would then
  // send "*Jai*" and nothing else. Same apology as the all-failed path.
  //
  // ORDER MATTERS: the escalation is kept, not dropped. The customer text is what
  // was lost — Jeremy still needs the alert, and TRIAL_CANCEL still needs to
  // release the slot. Downstream this is also strictly better than a bare
  // apology: the webhook's JOIN_INTENT guard swaps in the handoff line. The quick
  // replies ARE dropped — a "Done" button under "having a quick issue" is noise,
  // and they were only ever labels for the message we just threw away.
  if (!parsed.messageText.trim()) {
    console.error("[jai-reply] model reply was only directives — sending canned apology");
    return { ...parsed, messageText: APOLOGY_TEXT, quickReplies: [] };
  }
  // A promise that Jeremy will make contact, with no escalation, means nobody
  // is told to make it. Round 8: a parent with a 20-year-old and a 15-year-old
  // was told "He'll reach out to you shortly 🙏" and Jeremy never heard.
  //
  // Round 6's version of this fired on JAI's own mandated greeting ("I'm Jai,
  // Coach Jeremy's assistant… I don't have your details on hand"), so it is
  // scoped now: Jeremy must be the SUBJECT of a future contact verb, not merely
  // named. "Coach Jeremy founded the gym" and "on hand" no longer match.
  const promisesContact =
    /\b(?:coach\s+)?jeremy\b[^.!?]{0,40}\b(?:will|'ll|is going to|can)\b[^.!?]{0,40}\b(?:reach out|contact|call|text|message|get back|follow up|be in touch|come down|sort (?:this|that) out)\b/i.test(
      parsed.messageText
    ) ||
    /\b(?:i'?ll|let me|going to)\b[^.!?]{0,30}\b(?:get|pass|hand|flag|send)\b[^.!?]{0,30}\b(?:to\s+)?(?:coach\s+)?jeremy\b/i.test(
      parsed.messageText
    ) ||
    // "…with Coach Jeremy. He'll reach out to you shortly" — the promise lands
    // in the next sentence with a pronoun subject, so the two patterns above
    // both miss it. This was the exact wording that lost the F lead.
    (/\bjeremy\b/i.test(parsed.messageText) &&
      /\b(?:he|she|they)\b[^.!?]{0,25}\b(?:will|'ll|is going to)\b[^.!?]{0,30}\b(?:reach out|contact|call|text|message|get back|follow up|be in touch|come down)\b/i.test(
        parsed.messageText
      ));
  if (!parsed.escalation && promisesContact) {
    console.error("[jai-reply] contact promised with no escalation — attaching one");
    parsed = {
      ...parsed,
      escalation: {
        escalation: "GENERAL_ESCALATION",
        intent: "promised_contact",
        source: "guard",
      },
    };
  }

  return parsed;
}

type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

// The guard itself fails open (see fact-guard.ts) — this only binds JMT's
// fact sheet + tenant config to it.
function guard(draft: string, customerText: string, facts: string): FactCheckResult {
  return validateReply(draft, facts, { customerText, config: JMT_FACT_GUARD_CONFIG });
}

function correctionPrompt(check: FactCheckResult): string {
  const bad = check.violations.map((v) => `"${v.token}" (${v.kind})`).join(", ");
  return (
    `SYSTEM CORRECTION — your last reply was NOT sent. It contained ${bad}, ` +
    `which does not appear anywhere in the FACT SHEET. Rewrite the reply now. ` +
    `Every time, price and link you state must be COPIED CHARACTER-FOR-CHARACTER ` +
    `from the FACT SHEET. If the fact sheet does not contain what they asked for, ` +
    `do not approximate it — say you'll check with Coach Jeremy and include the ` +
    `escalation JSON block. Reply with the customer-facing message only.`
  );
}
