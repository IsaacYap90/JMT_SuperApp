// Photo understanding for JAI. WhatsApp only gives us a media id; we download
// the image and use Google Gemini (free tier — the bot's DeepSeek text model
// can't see images) to describe it, so the normal reply flow can respond.
// Returns a short plain-text description, or null if it can't read the image.

const GEMINI_MODEL = "gemini-2.0-flash";

export async function describeImage(
  base64: string,
  mimeType: string,
  caption?: string | null,
): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.error("[vision] GEMINI_API_KEY not set");
    return null;
  }
  const prompt =
    "A member of a Muay Thai gym sent this photo over WhatsApp" +
    (caption ? ` with the caption: "${caption}".` : ".") +
    " In 1-2 short sentences, describe what it shows and anything a gym" +
    " assistant needs to reply — e.g. a schedule/booking screenshot, a payment" +
    " receipt, gear, an injury, a QR code, an ID. Be factual, no preamble.";

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inline_data: { mime_type: mimeType, data: base64 } },
                { text: prompt },
              ],
            },
          ],
          generationConfig: { maxOutputTokens: 200, temperature: 0.2 },
        }),
      },
    );
    if (!res.ok) {
      console.error("[vision] Gemini error", res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const out = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim();
    return out || null;
  } catch (err) {
    console.error("[vision] describeImage error", err);
    return null;
  }
}
