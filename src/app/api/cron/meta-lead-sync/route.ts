// Daily Meta lead reconciliation — catches any leads Meta failed to push via webhook.
// Checks the last 3 days of leads across all active forms and backfills any gaps.
//
// Triggered by Vercel Cron at "0 0 * * *" UTC = 08:00 SGT.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendTelegramPlainToUser } from "@/lib/telegram-alert";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const JEREMY_USER_ID = "2ee6ecaf-f68e-4a0a-a249-0fe7ce019db8";

function formatPhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-()]/g, "");
  if (cleaned.startsWith("+65")) return cleaned;
  if (cleaned.startsWith("65") && cleaned.length === 10) return `+${cleaned}`;
  if (/^[689]\d{7}$/.test(cleaned)) return `+65${cleaned}`;
  if (!cleaned.startsWith("+")) return `+${cleaned}`;
  return cleaned;
}

function waLink(phone: string, name?: string): string {
  const digits = formatPhone(phone).replace(/\+/g, "");
  const first = (name || "").trim().split(/\s+/)[0] || "there";
  const sgHour = (new Date().getUTCHours() + 8) % 24;
  const greeting = sgHour < 12 ? "Good morning" : sgHour < 18 ? "Good afternoon" : "Good evening";
  const msg = `${greeting} ${first}! Thanks for getting in touch via our Facebook/Instagram!\n\nWe'd love to help you get started in learning the art of Muay Thai.\n\nWould you like to schedule a session for yourself?\n\nThank you :)\n\nJeremy Jude\nJai Muay Thai\n\nFind out more about our sessions here too: https://jaimuaythai.com/adults/`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const pageToken = process.env.META_PAGE_ACCESS_TOKEN;
  const pageId = "100201532436456";

  if (!supabaseUrl || !supabaseKey || !pageToken) {
    return NextResponse.json({ error: "Missing env vars" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Look back 3 days to catch any webhook misses
  const since = Math.floor(Date.now() / 1000) - 3 * 24 * 60 * 60;

  type MetaLead = {
    id: string;
    created_time: string;
    ad_name?: string;
    field_data: Array<{ name: string; values: string[] }>;
  };

  // Step 1: get all active leadgen forms for the page
  const formsRes = await fetch(
    `https://graph.facebook.com/v21.0/${pageId}/leadgen_forms?access_token=${pageToken}&fields=id,name,status&limit=25`
  );
  if (!formsRes.ok) {
    const err = await formsRes.text();
    console.error("[meta-lead-sync] Failed to fetch forms:", err);
    return NextResponse.json({ error: "Meta forms API error", detail: err }, { status: 500 });
  }
  const formsData = await formsRes.json();
  const forms: Array<{ id: string; name: string; status: string }> = formsData.data || [];
  const activeFormIds = forms.map((f) => f.id);

  if (activeFormIds.length === 0) {
    return NextResponse.json({ synced: 0, message: "No leadgen forms found for page" });
  }

  // Step 2: fetch leads from each form (Meta only supports /formId/leads, not /pageId/leads)
  const allLeads: MetaLead[] = [];
  for (const formId of activeFormIds) {
    const metaRes = await fetch(
      `https://graph.facebook.com/v21.0/${formId}/leads?access_token=${pageToken}&fields=id,created_time,ad_name,field_data&filtering=[{"field":"time_created","operator":"GREATER_THAN","value":${since}}]&limit=50`
    );
    if (!metaRes.ok) {
      const err = await metaRes.text();
      console.error(`[meta-lead-sync] Error fetching leads for form ${formId}:`, err);
      continue;
    }
    const metaData = await metaRes.json();
    allLeads.push(...(metaData.data || []));
  }

  // Deduplicate by lead ID (a lead can't appear in multiple forms, but be safe)
  const seen = new Set<string>();
  const metaLeads = allLeads.filter((l) => {
    if (seen.has(l.id)) return false;
    seen.add(l.id);
    return true;
  });

  if (metaLeads.length === 0) {
    return NextResponse.json({ synced: 0, message: "No Meta leads in last 3 days", forms_checked: activeFormIds.length });
  }

  // Check which ones are already in our DB
  const metaIds = metaLeads.map((l) => l.id);
  const { data: existing } = await supabase
    .from("leads")
    .select("meta_lead_id")
    .in("meta_lead_id", metaIds);

  const existingIds = new Set((existing || []).map((r) => r.meta_lead_id));
  const missing = metaLeads.filter((l) => !existingIds.has(l.id));

  if (missing.length === 0) {
    return NextResponse.json({ synced: 0, message: "All leads already captured" });
  }

  // Backfill missing leads
  let synced = 0;
  for (const lead of missing) {
    const get = (key: string) => {
      const f = lead.field_data.find((f) =>
        f.name.toLowerCase().includes(key.toLowerCase())
      );
      return f?.values?.[0] || "";
    };

    const name = get("full_name") || get("name") || "Unknown";
    const phone = get("phone") || get("phone_number") || get("contact_no") || get("contact") || get("mobile") || "";
    const email = get("email") || "";
    const interest = get("interest") || get("what") || get("training") || get("goals") || "";
    const source = "instagram";

    const { error: insertErr } = await supabase.from("leads").insert({
      name,
      phone,
      email,
      interest,
      source,
      meta_lead_id: lead.id,
      status: "new",
      assigned_to: JEREMY_USER_ID,
    });

    if (insertErr) {
      console.error("[meta-lead-sync] insert error for", lead.id, insertErr);
      continue;
    }

    // Alert Jeremy
    const lines = [
      `New lead recovered (missed webhook) — Instagram`,
      ``,
      `Name: ${name}`,
      phone ? `Phone: ${phone}` : null,
      email ? `Email: ${email}` : null,
      interest ? `Interest: ${interest}` : null,
      phone ? `\n${waLink(phone, name)}` : null,
    ].filter(Boolean);

    await sendTelegramPlainToUser(JEREMY_USER_ID, lines.join("\n"));
    synced++;
  }

  return NextResponse.json({ synced, checked: metaLeads.length, missing: missing.length, forms_checked: activeFormIds.length });
}
