"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateTrialBookingStatus } from "@/app/actions/trials";

interface Booking {
  id: string;
  name: string;
  phone: string;
  programme: string;
  class_id: string;
  booking_date: string;
  time_slot: string;
  status: string;
  created_at: string;
  class: { name: string; start_time: string; end_time: string } | null;
}

function statusBadge(status: string) {
  switch (status) {
    case "booked":
      return "bg-blue-500/10 text-blue-400";
    case "showed":
      return "bg-green-500/10 text-green-400";
    case "no_show":
      return "bg-red-500/10 text-red-400";
    case "cancelled":
      return "bg-jai-text/10 text-jai-text";
    default:
      return "bg-jai-text/10 text-jai-text";
  }
}

const PROGRAMME_COLORS: Record<string, string> = {
  adult: "bg-jai-blue/10 text-jai-blue",
  kids: "bg-green-500/10 text-green-400",
  teens: "bg-yellow-500/10 text-yellow-400",
};

export function TrialManagementClient({ bookings }: { bookings: Booking[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [actioningId, setActioningId] = useState<string | null>(null);

  const today = new Date().toISOString().split("T")[0];
  const upcoming = bookings.filter(
    (b) => b.booking_date >= today && b.status === "booked"
  );
  const past = bookings.filter(
    (b) => b.booking_date < today || b.status !== "booked"
  );

  const displayed = tab === "upcoming" ? upcoming : past;

  const handleAction = async (
    id: string,
    status: "showed" | "no_show" | "cancelled"
  ) => {
    setActioningId(id);
    try {
      await updateTrialBookingStatus(id, status);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    }
    setActioningId(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold">Trial Bookings</h1>
        <p className="text-jai-text text-sm mt-1">
          {upcoming.length} upcoming trial{upcoming.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-jai-card border border-jai-border rounded-lg p-1">
        <button
          onClick={() => setTab("upcoming")}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
            tab === "upcoming"
              ? "bg-jai-blue text-white"
              : "text-jai-text hover:text-white"
          }`}
        >
          Upcoming ({upcoming.length})
        </button>
        <button
          onClick={() => setTab("past")}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
            tab === "past"
              ? "bg-jai-blue text-white"
              : "text-jai-text hover:text-white"
          }`}
        >
          History ({past.length})
        </button>
      </div>

      {/* Booking cards */}
      <div className="space-y-2">
        {displayed.map((b) => (
          <div
            key={b.id}
            className="bg-jai-card border border-jai-border rounded-xl p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-sm">{b.name}</p>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full capitalize ${PROGRAMME_COLORS[b.programme] || ""}`}
                  >
                    {b.programme}
                  </span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full capitalize ${statusBadge(b.status)}`}
                  >
                    {b.status.replace("_", " ")}
                  </span>
                </div>
                <p className="text-jai-text text-xs mt-1">
                  {b.class?.name || "—"} · {b.time_slot}
                </p>
                <p className="text-jai-text text-xs">
                  {new Date(b.booking_date + "T00:00:00+08:00").toLocaleDateString("en-SG", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}
                </p>
                <a
                  href={`https://wa.me/65${b.phone.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-400 text-xs mt-1 inline-block"
                >
                  +65{b.phone.replace(/\D/g, "")}
                </a>
              </div>
            </div>

            {/* Action buttons for upcoming */}
            {b.status === "booked" && (
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => handleAction(b.id, "showed")}
                  disabled={actioningId === b.id}
                  className="flex-1 py-2 bg-green-600/10 text-green-400 border border-green-500/20 text-xs rounded-lg min-h-[44px] font-medium disabled:opacity-50"
                >
                  Showed
                </button>
                <button
                  onClick={() => handleAction(b.id, "no_show")}
                  disabled={actioningId === b.id}
                  className="flex-1 py-2 bg-red-500/10 text-red-400 border border-red-500/20 text-xs rounded-lg min-h-[44px] font-medium disabled:opacity-50"
                >
                  No Show
                </button>
                <button
                  onClick={() => handleAction(b.id, "cancelled")}
                  disabled={actioningId === b.id}
                  className="flex-1 py-2 bg-jai-text/10 text-jai-text border border-jai-border text-xs rounded-lg min-h-[44px] font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        ))}
        {displayed.length === 0 && (
          <div className="bg-jai-card border border-jai-border rounded-xl p-6 text-center">
            <p className="text-jai-text text-sm">
              {tab === "upcoming"
                ? "No upcoming trial bookings"
                : "No past trial bookings"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
