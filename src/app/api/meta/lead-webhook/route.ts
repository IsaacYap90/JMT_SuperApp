import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendTelegramPlainToUser } from "@/lib/telegram-alert";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Jeremy Jude's user ID — he receives all lead alerts
const JEREMY_USER_ID = "2ee6ecaf-f68e-4a0a-a249-0fe7ce019db8";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function formatPhone(phone: string): string {
  // Strip spaces, dashes, brackets
  const cleaned = phone.replace(/[\s\-()]/g, "");
  // If starts with +65 or 65, keep as is
  if (cleaned.startsWith("+65")) return cleaned;
  if (cleaned.startsWith("65") && cleaned.length === 10) return `+${cleaned}`;
  // If 8-digit SG number, prepend +65
  if (/^[689]\d{7}$/.test(cleaned)) return `+65${cleaned}`;
  // Otherwise return with + if missing
  if (!cleaned.startsWith("+")) return `+${cleaned}`;
  return cleaned;
}

function waLink(phone: string): string {
  const digits = formatPhone(phone).replace(/\+/g, "");
  return `https://wa.me/${digits}`;
}

// ── GET: Meta webhook verification ──
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");

  const verifyToken = process.env.META_LEAD_VERIFY_TOKEN;

  if (mode === "subscribe" && token === verifyToken) {
    console.log("[meta-lead-webhook] verification OK");
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// ── POST: Receive lead form submissions ──
export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "no supabase" }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  // Meta sends: { object: "page", entry: [{ id, time, changes: [{ field: "leadgen", value: { ... } }] }] }
  const entries = (body.entry || []) as Array<{
    id: string;
    time: number;
    changes?: Array<{
      field: string;
      value: {
        form_id: string;
        leadgen_id: string;
        created_time: number;
        page_id: string;
      };
    }>;
  }>;

  let processed = 0;

  for (const entry of entries) {
    for (const change of entry.changes || []) {
      if (change.field !== "leadgen") continue;

      const { form_id, leadgen_id } = change.value;

      // Check if we already processed this lead
      const { data: existing } = await supabase
        .from("leads")
        .select("id")
        .eq("meta_lead_id", leadgen_id)
        .maybeSingle();

      if (existing) continue;

      // Fetch full lead data from Meta's Leads API
      const leadData = await fetchLeadData(leadgen_id);
      if (!leadData) {
        console.error("[meta-lead-webhook] failed to fetch lead data for", leadgen_id);
        continue;
      }

      const name = leadData.name || "Unknown";
      const phone = leadData.phone || "";
      const email = leadData.email || "";
      const interest = leadData.interest || "";
      const source = leadData.platform || "instagram";

      // Save to database
      const { error: insertErr } = await supabase.from("leads").insert({
        name,
        phone,
        email,
        interest,
        source,
        meta_form_id: form_id,
        meta_lead_id: leadgen_id,
        status: "new",
        assigned_to: JEREMY_USER_ID,
      });

      if (insertErr) {
        console.error("[meta-lead-webhook] insert error:", insertErr);
        continue;
      }

      // Alert Jeremy on Telegram
      const lines = [
        `New lead from ${source === "facebook" ? "Facebook" : "Instagram"}!`,
        ``,
        `Name: ${name}`,
        phone ? `Phone: ${phone}` : null,
        email ? `Email: ${email}` : null,
        interest ? `Interest: ${interest}` : null,
        phone ? `\n${waLink(phone)}` : null,
      ].filter(Boolean);

      await sendTelegramPlainToUser(JEREMY_USER_ID, lines.join("\n"));
      processed++;
    }
  }

  return NextResponse.json({ ok: true, processed });
}

// Fetch lead details from Meta Graph API
async function fetchLeadData(
  leadgenId: string
): Promise<{ name: string; phone: string; email: string; interest: string; platform: string } | null> {
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  if (!token) {
    console.error("[meta-lead-webhook] META_PAGE_ACCESS_TOKEN not set");
    return null;
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${leadgenId}?access_token=${token}`
    );
    if (!res.ok) {
      console.error("[meta-lead-webhook] Graph API error:", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    // data.field_data is an array of { name, values: [string] }
    const fields = (data.field_data || []) as Array<{ name: string; values: string[] }>;

    const get = (key: string) => {
      const f = fields.find(
        (f) => f.name.toLowerCase().includes(key.toLowerCase())
      );
      return f?.values?.[0] || "";
    };

    return {
      name: get("full_name") || get("name") || "",
      phone: get("phone") || get("phone_number") || "",
      email: get("email") || "",
      interest: get("interest") || get("what") || get("training") || "",
      platform: data.platform || "instagram",
    };
  } catch (err) {
    console.error("[meta-lead-webhook] fetch error:", err);
    return null;
  }
}
