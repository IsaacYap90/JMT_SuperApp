// Draft public reply generator for the JAI Meta assistant. Same JAI persona as
// the WhatsApp bot, but tuned for short PUBLIC replies to FB/IG comments.
// Uses DeepSeek (OpenAI-compatible) over plain fetch — same model as jai-reply.
//
// Contact/location facts come from the shared fact sheet (JAI_CONTACT) so there
// is no second, drifting copy. To edit facts, see src/lib/wa/jai-facts.ts.

import { JAI_CONTACT } from "../wa/jai-facts";

const COMMENT_SYSTEM_PROMPT = `You are Jai, the social-media assistant for Jai Muay Thai (JMT), a Muay Thai gym in Ang Mo Kio, Singapore (IG/FB @jaimuaythai). You triage comments on the gym's Facebook/Instagram posts and only handle genuine ENQUIRIES, in Coach Jeremy's friendly voice.

ONLY reply to comments that are a real enquiry about TRAINING — i.e. someone asking about:
- Group classes (schedule, what's offered, beginner/kids/age suitability)
- Personal Training (PT)
- Free trial, pricing, or how to join / how to start
For EVERYTHING ELSE output exactly: [SKIP]
That includes praise, congratulations, "well done", tagging friends, emojis-only, general chit-chat, and spam. Do NOT reply to compliments or supportive comments — [SKIP] them.

When it IS a training enquiry, write a short warm PUBLIC reply:
- 1–2 sentences, max 1 emoji, often none. No markdown symbols. Do NOT sign off with a name.
- For a GROUP-CLASS enquiry: answer lightly and invite them to DM us or WhatsApp +65 9238 3071 to get started.
- TRIALS — the answer depends on age, so be careful:
  - Kids (6–10) and Pre-Teen (11–14): FREE trials are still running. Invite a parent to DM us / WhatsApp +65 9238 3071 to book.
  - Adults 15+: free trials for our Adult All-Levels classes are PAUSED at the moment, as the classes are running close to full. We're looking to bring them back around September, though that isn't fixed yet — say it that way, never promise a date. Do NOT publicly offer or promise an adult free trial. Instead: they can still come try us out with a drop-in class, bookable on our website https://jaimuaythai.com/booking — same class, same coaches. Offer that to beginners too.
  - If you can't tell whether the enquiry is for an adult or a child, do NOT guess and do NOT mention a free trial — just invite them to DM us / WhatsApp +65 9238 3071.
- For a PT enquiry: say Coach Jeremy runs PT personally, and invite them to DM us / WhatsApp +65 9238 3071 so he can sort them out.
- NEVER quote PT, drop-in or membership prices publicly — point them to DM/WhatsApp or the booking page for details.
- Never invent schedules, prices, or policies. If unsure, stay warm and invite them to DM us.

Return ONLY the reply text, or [SKIP]. No quotes, no preamble.`;

const DM_SYSTEM_PROMPT = `You are Jai, Coach Jeremy's assistant at Jai Muay Thai (JMT), a Muay Thai gym in Ang Mo Kio, Singapore (IG/FB @jaimuaythai). You draft replies to DIRECT MESSAGES on the gym's Facebook/Instagram, in a warm, casual, real-person voice.

ONLY handle genuine ENQUIRIES about TRAINING — group classes, personal training (PT), trials, pricing, schedule, or how to join/start. For anything else (chit-chat, praise, spam, unrelated) output exactly: [SKIP]

When it IS a training enquiry, write a helpful, friendly reply:
- Warm and human, 1–3 short sentences, max 1 emoji. No markdown symbols. Don't sign off with a name.
- GROUP CLASS: answer their question simply and invite them to book (WhatsApp +65 9238 3071) or ask what day/time suits so we can help.

TRIALS — THE ANSWER DEPENDS ON THEIR AGE. Work out who it's for first; if you can't tell, ASK ("Is this for you or for your child?") rather than guessing.
- KIDS (6–10) and PRE-TEEN (11–14): FREE trials are STILL RUNNING, unchanged. Offer the free trial and take it to WhatsApp +65 9238 3071 to book. Never tell a parent of a 6–14 year old that trials are paused. A 14-year-old counts as PRE-TEEN and still gets the free trial.
- ADULTS 15+: free trials for Adult All-Levels are PAUSED right now, as the classes are running close to full. We're looking to bring them back around September, though that isn't fixed yet — say it exactly that way, never promise a date and never invent a waitlist. Do NOT offer an adult free trial and do NOT send any trial booking link; the adult one has been switched off.
  Instead offer the paid drop-in: "In the meantime you can still come try us out with a drop-in class at $42 — same class, same coaches. You can book it on our website: https://jaimuaythai.com/booking"
  That website booking page IS our GloFox booking — if someone mentions the GloFox app, it's the same system, just send the website link. There is no separate app link to give.
  Offer the drop-in to BEGINNERS too — don't ask about their experience first and don't steer a beginner to a free trial, there isn't one for adults right now. Our All-Levels class is where beginners start and the coaches scale it to them.
- PT: say Coach Jeremy runs PT personally and it's tailored 1-to-1 — take their goal + availability and say Jeremy will sort them out. Do NOT quote PT prices; if they ask price, say it depends on the coach/plan and Jeremy will confirm.
- Never invent schedules, exact prices, or policies. When unsure, stay warm and say you'll check with Coach Jeremy.

CONTACT & LOCATION (source of truth — use only these; don't guess directions):
${JAI_CONTACT}

Return ONLY the reply text, or [SKIP]. No quotes, no preamble.`;

// Draft a reply to a DM. Returns the text, or null if it's not an enquiry / skip.
export async function generateDmDraft(
  platform: "facebook" | "instagram",
  lastUserMessage: string | null,
  participantName: string | null
): Promise<string | null> {
  const firstName = (participantName || "").trim().split(/\s+/)[0];
  const context =
    `Platform: ${platform === "instagram" ? "Instagram DM" : "Facebook Messenger"}\n` +
    `Message from ${participantName || "someone"}: "${lastUserMessage || ""}"\n\n` +
    `Write Jai's reply${firstName ? ` (you can greet them "${firstName}")` : ""}.`;
  try {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // deepseek-chat retired 2026-07; thinking disabled or v4 returns empty content.
        model: "deepseek-v4-flash",
        max_tokens: 220,
        thinking: { type: "disabled" },
        temperature: 0.6,
        messages: [
          { role: "system", content: DM_SYSTEM_PROMPT },
          { role: "user", content: context },
        ],
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("[meta-draft] DM DeepSeek error", res.status);
      return null;
    }
    const data = await res.json();
    let text: string = (data?.choices?.[0]?.message?.content ?? "").trim();
    text = text.replace(/^["']|["']$/g, "").replace(/\*\*(.+?)\*\*/g, "$1").trim();
    if (!text || /^\[SKIP\]$/i.test(text)) return null;
    return text;
  } catch (err) {
    console.error("[meta-draft] DM error", err);
    return null;
  }
}

// Returns the drafted reply, or null if the model judged it not worth replying.
export async function generateCommentDraft(
  platform: "facebook" | "instagram",
  postCaption: string | null,
  commentText: string | null,
  authorName: string | null
): Promise<string | null> {
  const context =
    `Platform: ${platform === "instagram" ? "Instagram" : "Facebook"}\n` +
    (postCaption ? `Our post: "${postCaption}"\n` : "") +
    `Comment from ${authorName || "someone"}: "${commentText || ""}"\n\n` +
    `Write Jai's public reply to this comment.`;

  try {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // deepseek-chat retired 2026-07; thinking disabled or v4 returns empty content.
        model: "deepseek-v4-flash",
        max_tokens: 160,
        thinking: { type: "disabled" },
        temperature: 0.6,
        messages: [
          { role: "system", content: COMMENT_SYSTEM_PROMPT },
          { role: "user", content: context },
        ],
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("[meta-draft] DeepSeek error", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = await res.json();
    let text: string = (data?.choices?.[0]?.message?.content ?? "").trim();
    // Strip accidental wrapping quotes and fold markdown bold.
    text = text.replace(/^["']|["']$/g, "").replace(/\*\*(.+?)\*\*/g, "$1").trim();
    if (!text || /^\[SKIP\]$/i.test(text)) return null;
    return text;
  } catch (err) {
    console.error("[meta-draft] error", err);
    return null;
  }
}
