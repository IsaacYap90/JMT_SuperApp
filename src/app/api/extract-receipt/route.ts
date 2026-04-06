import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  // Convert file to base64
  const bytes = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString("base64");
  const mimeType = file.type || "image/jpeg";

  const openai = new OpenAI({ apiKey });

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You extract payment/earnings information from receipts, invoices, and pay slips. Return a JSON object with these fields:
- amount: number (the total amount in SGD)
- date: string (YYYY-MM-DD format)
- type: one of "salary", "pt_weekly", "bonus", "other"
- description: string (brief description like "April 2026 Basic Salary" or "Week 3 PT Pay")

Rules for type detection:
- "salary" = monthly salary, basic pay
- "pt_weekly" = PT sessions, personal training weekly pay
- "bonus" = bonuses, incentives
- "other" = anything else

Return ONLY valid JSON, no markdown or explanation.`,
      },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${base64}` },
          },
          {
            type: "text",
            text: "Extract the payment details from this receipt/invoice.",
          },
        ],
      },
    ],
    max_tokens: 200,
  });

  const content = response.choices[0]?.message?.content?.trim() || "";

  try {
    // Strip markdown code fences if present
    const cleaned = content.replace(/^```json?\s*/, "").replace(/\s*```$/, "");
    const data = JSON.parse(cleaned);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to parse receipt", raw: content },
      { status: 422 }
    );
  }
}
