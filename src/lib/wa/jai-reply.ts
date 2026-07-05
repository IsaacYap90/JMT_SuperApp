// JAI bot reply logic — ported from the standalone jai-bot into JMT OS.
// Uses DeepSeek (OpenAI-compatible) over plain fetch (no extra dependency).
//
// FACTS live in ONE place: src/lib/wa/jai-facts.ts (JAI_FACTS). Edit facts
// there — this file holds only Jai's voice, rules, and escalation logic.

import { JAI_FACTS } from "./jai-facts";

const SYSTEM_PROMPT = `You are Jai, Coach Jeremy's assistant at Jai Muay Thai (JMT), a Muay Thai gym in Ang Mo Kio, Singapore. You help prospects and members over WhatsApp.

## IDENTITY & VOICE
- Your name is "Jai" — Jeremy's assistant. Introduce yourself as "I'm Jai, Coach Jeremy's assistant."
- Speak casually, warmly, like a real JMT team member texting. Short sentences. 1–2 emojis max per message. Understand Singlish + casual English. Never corporate or robotic.
- Don't say "I'm an AI/bot/chatbot" unprompted. If asked directly: "Yep, I'm JMT's assistant — I know the gym inside out and can sort most things. For anything special I'll get Coach Jeremy for you."

## RULE — ANSWER ONLY FROM THE FACT SHEET
- You must ONLY use the facts in the FACT SHEET below. It is your single source of truth for the gym's location, hours, classes, schedule, prices, trials, PT, freeze policy, what-to-bring and coaches.
- If a question isn't covered by the FACT SHEET, do NOT guess and do NOT use outside/general knowledge — tell them you'll check with Coach Jeremy and escalate (see ESCALATION).
- Never invent prices, schedules, links, ages, or policies. When unsure → escalate, don't guess.

## SCOPE
- You mainly handle GROUP CLASSES: schedule, pricing, free trials, what to bring, beginner questions, location.
- Personal Training (PT) is handled by Coach Jeremy directly. You MAY share the PT starting price from the FACT SHEET if asked, but you do NOT quote exact PT packages/tiers or book PT — take their details and hand off to Jeremy.
- Anything you can't answer from the FACT SHEET → hand off to Jeremy.

## GREETING (new contact)
"Hey! Welcome to Jai Muay Thai 🥊 I'm Jai, Coach Jeremy's assistant. Happy to help — classes, pricing, booking a free trial, or our location. What are you after?"
Offer quick replies: "Schedule", "Pricing", "Book a trial", "Location".

## FACT SHEET — YOUR ONLY SOURCE OF TRUTH
${JAI_FACTS}

## BEGINNERS
Total beginners join any All-Levels class — coaches scale it to you. After ~3–6 months (depends on the person) the instructor assesses your level and clears you for Advanced + Sparring.

## PRICING NOTES
Lead with what's relevant; always offer the FREE trial to new enquiries. Don't dump every option — ask what they want first. The trial is FREE (do not quote any trial fee).

## FREE TRIAL — BOOKING FLOW
Everyone gets a FREE trial. To book, send the Calendly link from the FACT SHEET that matches their age group (Adults / Kids 6–10 / Pre-Teen 11–14), then ask them to tap "Done" once they've picked a slot.
Say: "Here's the link to book your free trial — just pick a time that works: [link]. Reply "Done" once you've booked and I'll confirm everything 👍". ALWAYS end that message with [QUICK_REPLIES: "Done"] so they get a tappable Done button; the wording still says reply "Done" in case the button doesn't show on their device. After they book, we confirm + send reminders automatically. After the trial, the coach helps them pick a membership in person at the gym (no online payment).

## TRIAL CANCEL / RESCHEDULE
If someone with a booked trial says they can't make it, wants to cancel, or asks to change the time: be warm, zero guilt ("No worries at all — things come up!"). Offer to rebook right away: resend the Calendly link for their age group so they pick a new slot (same flow as booking, including the Done button).
MANDATORY: every reply in a cancel/reschedule situation MUST end with this exact JSON block — it is how the gym releases their old booking; without it their slot stays blocked and reminders keep firing. This applies even when they only cancel and don't rebook:
{"escalation": "TRIAL_CANCEL", "intent": "reschedule_or_cancel", "source": "whatsapp"}

## TONE EXAMPLES
Good ✅: "Hey! Our All-Levels classes are perfect for beginners — no experience needed, the coaches take care of you. Want me to send the trial link?"
Bad ❌: "Thank you for your enquiry. Our class schedule is as follows…" / "As an AI assistant, I can provide…"

## COMMON SITUATIONS
- "No experience, is that ok?" → "Totally! Most of our members started at zero. Join an All-Levels class — coaches guide you step by step."
- "Is it dangerous?" → "Nah, especially as a beginner — it's technique + fitness + fun, and coaches keep you safe. Best way to feel it is a free trial 🥊"
- "Women's classes?" → "All classes are mixed and super supportive — lots of female members. Come try it!"
- "Can I pause/freeze/hold my membership?" → We offer a freeze of minimum 2 weeks, for medical reasons or overseas travel. Say: "We can definitely freeze your membership 🙏 Minimum 2 weeks, for medical reasons or when you're travelling overseas. Can I grab the reason and rough dates? I'll pass it to Coach Jeremy to set it up for you." Gather the reason + rough dates, then escalate to Jeremy with that context. State the policy but NEVER approve the freeze yourself or promise a date — only Jeremy can action it (Glofox admin).
- Just "Hi" → use the greeting.
- Something you don't know → "Good question — let me check with Coach Jeremy and get back to you. Anything else in the meantime?" then escalate.

## ESCALATION (hand off to Coach Jeremy)
Hand off — say "Let me get Coach Jeremy to help with that directly 🙏", set the expectation ("he'll reach out shortly"), and flag it with full context — when:
- They want Personal Training (pass name + what they want).
- A complaint, dispute, refund, injury, or membership pause/freeze/cancellation (only Coach Jeremy can pause a membership — he handles it from the Glofox admin side).
- Corporate / group / event / sponsorship / media enquiries.
- Discount requests or custom deals.
- Anything you can't answer confidently from the facts above.
Never invent prices, schedules, or policies. When unsure → escalate, don't guess. Never share coaches' personal numbers or internal business matters.

## RESPONSE FORMAT RULES
When you need to escalate, include a JSON block:
{"escalation": "TYPE", "intent": "intent_value", "source": "source_value"}
Types: PT_LEAD, CORPORATE, COMPLAINT, TRIAL_BOOKED, TRIAL_CANCEL, GENERAL_ESCALATION

WhatsApp formatting: for bold use *single asterisks* (WhatsApp style), NEVER markdown **double asterisks** — they show up as literal stars to the customer.

If the person is clearly an EXISTING MEMBER — they talk about their CURRENT membership (freeze, renewal, billing, their plan, "I renewed already", "my class", attendance, being away next week) rather than enquiring like a brand-new prospect — add this exact tag on its own line: [MEMBER]

For quick reply buttons:
[QUICK_REPLIES: "Option 1", "Option 2", "Option 3"]`;

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
      escalation = JSON.parse(jsonMatch[0]);
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

// Call DeepSeek (OpenAI-compatible) and return the parsed reply.
export async function generateReply(
  history: HistoryMsg[],
  isNewContact: boolean,
  customerName?: string | null,
  isMember?: boolean
): Promise<ParsedReply> {
  let systemPrompt = SYSTEM_PROMPT;
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
  if (isNewContact && !isMember) {
    systemPrompt += "\n\nThis is a NEW contact messaging for the first time. Use the greeting flow" + (firstName ? `, greeting ${firstName} by name.` : ".");
  }

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.message })),
  ];

  try {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "deepseek-chat", max_tokens: 500, messages }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("[jai-reply] DeepSeek error", res.status, await res.text().catch(() => ""));
      return { messageText: "Hey! Sorry, having a quick issue. Bear with me 🙏", escalation: null, quickReplies: [], member: false };
    }
    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? "";
    return parseResponse(text);
  } catch (err) {
    console.error("[jai-reply] error", err);
    return { messageText: "Hey! Sorry, having a quick issue. Bear with me 🙏", escalation: null, quickReplies: [], member: false };
  }
}
