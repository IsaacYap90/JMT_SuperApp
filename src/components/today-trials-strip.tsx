"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateTrialBookingStatus } from "@/app/actions/trials";
import { showToast } from "@/components/toast";
import { haptic } from "@/lib/haptic";

export type TrialRow = {
  id: string;
  name: string;
  phone: string | null;
  status: "booked" | "showed" | "no_show" | "cancelled";
  class_name: string;
  class_start_time: string; // HH:MM
  class_end_time: string;
};

function fmt12(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  let h = parseInt(hStr, 10);
  const suffix = h >= 12 ? "pm" : "am";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${mStr}${suffix}`;
}

export function TodayTrialsStrip({ trials, actionable }: { trials: TrialRow[]; actionable: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState(trials);
  const [busy, setBusy] = useState<string | null>(null);

  if (rows.length === 0) return null;

  const action = async (id: string, next: "showed" | "no_show" | "cancelled") => {
    const prev = rows;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: next } : r)));
    setBusy(id + next);
    haptic("tap");
    try {
      await updateTrialBookingStatus(id, next);
      haptic("success");
      const labels = { showed: "Showed", no_show: "No-show", cancelled: "Cancelled" } as const;
      const r = rows.find((x) => x.id === id);
      showToast(`${labels[next]} — ${r?.name || "trial"}`);
      router.refresh();
    } catch (e) {
      setRows(prev);
      haptic("error");
      showToast(e instanceof Error ? e.message : "Failed", "error");
    }
    setBusy(null);
  };

  return (
    <section>
      <h2 className="text-sm font-semibold text-jai-text uppercase tracking-wider mb-2">Today&rsquo;s Trials</h2>
      <div className="space-y-2">
        {rows.map((r) => {
          const resolved = r.status !== "booked";
          const statusLabel =
            r.status === "showed" ? "Showed" : r.status === "no_show" ? "No-show" : r.status === "cancelled" ? "Cancelled" : "";
          const statusClasses =
            r.status === "showed"
              ? "bg-green-500/10 text-green-400 border-green-500/20"
              : r.status === "no_show"
              ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
              : "bg-red-500/10 text-red-400 border-red-500/20";

          return (
            <div
              key={r.id}
              className={`bg-jai-card border rounded-xl p-3 ${
                resolved ? "border-jai-border opacity-70" : "border-jai-border"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {r.name}
                    <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/25 uppercase tracking-wider align-middle">
                      Trial
                    </span>
                  </p>
                  <p className="text-xs text-jai-text/70">
                    {fmt12(r.class_start_time)}–{fmt12(r.class_end_time)} · {r.class_name}
                  </p>
                </div>
                {resolved && (
                  <span className={`text-[10px] px-2 py-1 rounded-full border ${statusClasses}`}>{statusLabel}</span>
                )}
                {r.phone && !resolved && (
                  <a
                    href={`tel:${r.phone}`}
                    className="text-[10px] px-2 py-1 rounded-full bg-jai-blue/10 text-jai-blue border border-jai-blue/20"
                    aria-label={`Call ${r.name}`}
                  >
                    📞
                  </a>
                )}
              </div>

              {actionable && !resolved && (
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => action(r.id, "showed")}
                    disabled={busy === r.id + "showed"}
                    className="flex-1 min-h-[40px] py-2 text-xs font-medium rounded-lg bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 disabled:opacity-50"
                  >
                    Showed
                  </button>
                  <button
                    onClick={() => action(r.id, "no_show")}
                    disabled={busy === r.id + "no_show"}
                    className="flex-1 min-h-[40px] py-2 text-xs font-medium rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 disabled:opacity-50"
                  >
                    No-show
                  </button>
                  <button
                    onClick={() => action(r.id, "cancelled")}
                    disabled={busy === r.id + "cancelled"}
                    className="flex-1 min-h-[40px] py-2 text-xs font-medium rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
