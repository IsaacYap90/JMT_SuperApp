// Member recognition helpers for JAI (the JMT AI assistant).
//
// Turns what we know about an inbound WhatsApp contact — are they a known
// member, do we have their name / notes, have we spoken before — into a short
// `contactContext` string that primes the reply model so JAI greets returning
// and known members correctly instead of treating everyone as brand-new.
import type { createJaiClient } from "@/lib/supabase/jai";
import { firstNameFrom } from "./jai-reply";

type HistoryMsg = { role: "user" | "assistant"; message: string };
type JaiClient = ReturnType<typeof createJaiClient>;

// Defensively read jai.leads.member_notes. That column may not exist yet (the
// migration ships alongside this feature and is applied separately), and it is
// optional besides — any error or absence returns null, never throws.
export async function fetchMemberNotes(
  sb: JaiClient,
  contactNumber: string
): Promise<string | null> {
  try {
    const { data, error } = await sb
      .from("leads")
      .select("member_notes")
      .eq("contact_number", contactNumber)
      .maybeSingle();
    if (error) return null;
    const notes = (data as { member_notes?: string | null } | null)?.member_notes;
    return notes && notes.trim() ? notes.trim() : null;
  } catch {
    return null;
  }
}

// Compact recap of the recent conversation so JAI can pick up where it left off
// without re-asking. Prior history only (excludes the just-received message).
function recapHistory(history: HistoryMsg[]): string {
  const recent = history.slice(-6);
  const parts = recent.map((m) => {
    const who = m.role === "user" ? "them" : "you";
    const txt = (m.message || "").replace(/\s+/g, " ").trim();
    return `${who}: ${txt.length > 80 ? txt.slice(0, 77) + "..." : txt}`;
  });
  let recap = parts.filter(Boolean).join(" | ");
  if (recap.length > 400) recap = recap.slice(0, 397) + "...";
  return recap;
}

// Build the one-line context passed into generateReply. Graceful when we know
// nothing — falls back to a plain new-contact line.
export function buildContactContext(opts: {
  isMember: boolean;
  contactName?: string | null;
  memberNotes?: string | null;
  history: HistoryMsg[];
}): string {
  const { isMember, contactName, memberNotes, history } = opts;
  const firstName = firstNameFrom(contactName);
  const who = firstName || (contactName && contactName.trim()) || "this contact";
  const hasHistory = (history?.length ?? 0) > 0;

  if (isMember) {
    let ctx = `Known member: ${who}.`;
    if (memberNotes) ctx += ` Notes: ${memberNotes}`;
    return ctx;
  }
  if (hasHistory) {
    const recap = recapHistory(history);
    return `Returning contact — you have spoken with ${who} before${recap ? ` (recap: ${recap})` : ""}.`;
  }
  return "New contact — no prior history on record.";
}
