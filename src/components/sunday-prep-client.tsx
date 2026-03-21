"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PtSession, PtConfirmation, ConfirmationStatus } from "@/lib/types/database";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  // Strip non-digits
  const digits = phone.replace(/\D/g, "");
  // Ensure country code
  if (digits.startsWith("65")) return digits;
  if (digits.startsWith("0")) return "65" + digits.slice(1);
  return "65" + digits;
}

function buildMessage(name: string, dayName: string, time: string): string {
  return `Hey ${name}, confirming your PT this ${dayName} at ${time} at JAI Muay Thai. See you there! 👊`;
}

function statusColor(status: ConfirmationStatus) {
  switch (status) {
    case "sent":
      return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
    case "replied":
      return "bg-green-500/10 text-green-400 border-green-500/20";
    default:
      return "bg-jai-text/10 text-jai-text border-jai-border";
  }
}

export function SundayPrepClient({
  sessions,
  confirmations,
  weekStart,
  weekLabel,
}: {
  sessions: PtSession[];
  confirmations: PtConfirmation[];
  weekStart: string;
  weekLabel: string;
}) {
  const router = useRouter();
  const supabase = createClient();

  // Build status map from confirmations
  const initialStatuses: Record<string, ConfirmationStatus> = {};
  for (const c of confirmations) {
    initialStatuses[c.pt_session_id] = c.status;
  }
  const [statuses, setStatuses] = useState<Record<string, ConfirmationStatus>>(initialStatuses);

  const getStatus = (sessionId: string): ConfirmationStatus => statuses[sessionId] || "unsent";

  const totalSessions = sessions.length;
  const contacted = sessions.filter((s) => getStatus(s.id) !== "unsent").length;

  const updateStatus = async (sessionId: string, newStatus: ConfirmationStatus) => {
    setStatuses((prev) => ({ ...prev, [sessionId]: newStatus }));

    // Upsert to Supabase
    const existing = confirmations.find((c) => c.pt_session_id === sessionId);
    if (existing) {
      await supabase
        .from("pt_confirmations")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await supabase.from("pt_confirmations").insert({
        pt_session_id: sessionId,
        status: newStatus,
        week_start: weekStart,
      });
    }
    router.refresh();
  };

  const handleSend = (session: PtSession) => {
    const phone = formatPhone(session.member?.phone);
    const dt = new Date(session.scheduled_at);
    const dayName = DAY_NAMES[dt.getDay()];
    const time = dt.toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit", hour12: true });
    const name = session.member?.full_name?.split(" ")[0] || "there";
    const message = buildMessage(name, dayName, time);
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

    // Open WhatsApp link
    window.open(url, "_blank");

    // Mark as sent
    if (getStatus(session.id) === "unsent") {
      updateStatus(session.id, "sent");
    }
  };

  const cycleStatus = (sessionId: string) => {
    const current = getStatus(sessionId);
    const next: ConfirmationStatus =
      current === "unsent" ? "sent" : current === "sent" ? "replied" : "unsent";
    updateStatus(sessionId, next);
  };

  // Group sessions by day
  const sessionsByDay: Record<string, PtSession[]> = {};
  for (const s of sessions) {
    const dt = new Date(s.scheduled_at);
    const dayKey = DAY_NAMES[dt.getDay()];
    if (!sessionsByDay[dayKey]) sessionsByDay[dayKey] = [];
    sessionsByDay[dayKey].push(s);
  }

  const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold">Sunday Prep</h1>
        <p className="text-jai-text text-sm mt-1">PT confirmations for {weekLabel}</p>
      </div>

      {/* Progress bar */}
      {totalSessions > 0 && (
        <div className="bg-jai-card border border-jai-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Progress</span>
            <span className="text-sm text-jai-text">
              {contacted}/{totalSessions} contacted
            </span>
          </div>
          <div className="w-full h-2 bg-jai-border rounded-full overflow-hidden">
            <div
              className="h-full bg-jai-blue rounded-full transition-all duration-300"
              style={{ width: `${totalSessions > 0 ? (contacted / totalSessions) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Empty state */}
      {totalSessions === 0 && (
        <div className="bg-jai-card border border-jai-border rounded-xl p-6 text-center">
          <p className="text-jai-text">No PT sessions booked for the coming week.</p>
        </div>
      )}

      {/* Session cards grouped by day */}
      {dayOrder.map((day) => {
        const daySessions = sessionsByDay[day];
        if (!daySessions || daySessions.length === 0) return null;

        return (
          <div key={day}>
            <h2 className="text-sm font-semibold text-jai-text mb-2 uppercase tracking-wide">
              {day}
            </h2>
            <div className="space-y-2">
              {daySessions.map((session) => {
                const dt = new Date(session.scheduled_at);
                const dateStr = dt.toLocaleDateString("en-SG", { day: "numeric", month: "short" });
                const timeStr = dt.toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit", hour12: true });
                const status = getStatus(session.id);
                const phone = formatPhone(session.member?.phone);
                const hasPhone = !!phone;

                return (
                  <div
                    key={session.id}
                    className="bg-jai-card border border-jai-border rounded-xl p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{session.member?.full_name || "—"}</p>
                        <p className="text-jai-text text-sm mt-0.5">
                          {phone ? `+${phone}` : "No phone"}
                        </p>
                        <p className="text-sm mt-1">
                          {day} {dateStr} · {timeStr}
                        </p>
                        {session.coach && (
                          <p className="text-jai-blue text-xs mt-0.5">
                            Coach: {session.coach.full_name}
                          </p>
                        )}
                      </div>

                      {/* Status badge - tappable to cycle */}
                      <button
                        onClick={() => cycleStatus(session.id)}
                        className={`text-[10px] px-2.5 py-1 rounded-full border capitalize min-h-[44px] flex items-center ${statusColor(status)}`}
                      >
                        {status}
                      </button>
                    </div>

                    {/* Send button */}
                    <button
                      onClick={() => handleSend(session)}
                      disabled={!hasPhone}
                      className={`w-full mt-3 py-2.5 rounded-lg text-sm font-medium min-h-[44px] transition-colors ${
                        hasPhone
                          ? "bg-green-600 text-white hover:bg-green-700"
                          : "bg-jai-border text-jai-text cursor-not-allowed"
                      }`}
                    >
                      {status === "unsent"
                        ? "Send via WhatsApp"
                        : status === "sent"
                        ? "Resend via WhatsApp"
                        : "Send Again"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
