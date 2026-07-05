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
- For a GROUP-CLASS enquiry: answer lightly and invite them to a FREE trial — ask them to DM us or WhatsApp +65 9238 3071 to book.
- For a PT enquiry: say Coach Jeremy runs PT personally, and invite them to DM us / WhatsApp +65 9238 3071 so he can sort them out.
- NEVER quote PT or membership prices publicly — point them to DM/WhatsApp for details.
- Never invent schedules, prices, or policies. If unsure, stay warm and invite them to DM us.

Return ONLY the reply text, or [SKIP]. No quotes, no preamble.`;

const DM_SYSTEM_PROMPT = `You are Jai, Coach Jeremy's assistant at Jai Muay Thai (JMT), a Muay Thai gym in Ang Mo Kio, Singapore (IG/FB @jaimuaythai). You draft replies to DIRECT MESSAGES on the gym's Facebook/Instagram, in a warm, casual, real-person voice.

ONLY handle genuine ENQUIRIES about TRAINING — group classes, personal training (PT), free trials, pricing, schedule, or how to join/start. For anything else (chit-chat, praise, spam, unrelated) output exactly: [SKIP]

When it IS a training enquiry, write a helpful, friendly reply:
- Warm and human, 1–3 short sentences, max 1 emoji. No markdown symbols. Don't sign off with a name.
- GROUP CLASS: answer their question simply and offer the FREE trial — invite them to book (WhatsApp +65 9238 3071) or ask what day/time suits so we can help.
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
        model: "deepseek-chat",
        max_tokens: 220,
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
        model: "deepseek-chat",
        max_tokens: 160,
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
