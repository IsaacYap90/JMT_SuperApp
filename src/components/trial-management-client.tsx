"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { updateTrialBookingStatus, adminCreateTrialBooking } from "@/app/actions/trials";

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

interface TrialClass {
  id: string;
  name: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  programme: string | null;
}

const DAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

// Next occurrence of a given weekday in Singapore time, on or after today
function nextDateForDay(dayOfWeek: string): string {
  const target = DAY_INDEX[dayOfWeek.toLowerCase()];
  if (target === undefined) return "";
  const nowSg = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Singapore" })
  );
  const current = nowSg.getDay();
  let diff = (target - current + 7) % 7;
  if (diff === 0) diff = 0; // same day = today
  const next = new Date(nowSg);
  next.setDate(nowSg.getDate() + diff);
  return next.toISOString().split("T")[0];
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

export function TrialManagementClient({
  bookings,
  classes,
}: {
  bookings: Booking[];
  classes: TrialClass[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    classId: "",
    bookingDate: "",
  });

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === form.classId) || null,
    [classes, form.classId]
  );

  const timeSlot = selectedClass
    ? `${selectedClass.start_time.slice(0, 5)} - ${selectedClass.end_time.slice(0, 5)}`
    : "";

  function pickClass(id: string) {
    const cls = classes.find((c) => c.id === id);
    setForm((f) => ({
      ...f,
      classId: id,
      bookingDate: cls ? nextDateForDay(cls.day_of_week) : "",
    }));
  }

  function resetForm() {
    setForm({ name: "", phone: "", classId: "", bookingDate: "" });
    setFormErr(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClass) {
      setFormErr("Pick a class");
      return;
    }
    if (!form.name.trim() || !form.phone.trim() || !form.bookingDate) {
      setFormErr("Fill in all fields");
      return;
    }
    setSaving(true);
    setFormErr(null);
    try {
      await adminCreateTrialBooking({
        name: form.name.trim(),
        phone: form.phone.trim(),
        programme: selectedClass.programme || "adult",
        classId: selectedClass.id,
        bookingDate: form.bookingDate,
        timeSlot,
      });
      setShowAdd(false);
      resetForm();
      router.refresh();
    } catch (err) {
      setFormErr(err instanceof Error ? err.message : "Failed");
    }
    setSaving(false);
  }

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
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Trial Bookings</h1>
          <p className="text-jai-text text-sm mt-1">
            {upcoming.length} upcoming trial{upcoming.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowAdd(true);
          }}
          className="bg-jai-blue text-white text-sm font-medium px-4 py-2 rounded-lg min-h-[44px] whitespace-nowrap"
        >
          + New
        </button>
      </div>

      {showAdd && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 pb-24 sm:pb-4"
          onClick={() => !saving && setShowAdd(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCreate}
            className="bg-jai-card border border-jai-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">New trial booking</h2>
              <button
                type="button"
                onClick={() => !saving && setShowAdd(false)}
                className="text-jai-text text-xl leading-none px-2"
              >
                ×
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-jai-text block mb-1">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2 text-sm"
                  placeholder="Full name"
                />
              </div>

              <div>
                <label className="text-xs text-jai-text block mb-1">Phone</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2 text-sm"
                  placeholder="8 digits, SG number"
                />
              </div>

              <div>
                <label className="text-xs text-jai-text block mb-1">Class</label>
                <select
                  value={form.classId}
                  onChange={(e) => pickClass(e.target.value)}
                  className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Select a class…</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.day_of_week.slice(0, 3).toUpperCase()}{" "}
                      {c.start_time.slice(0, 5)}–{c.end_time.slice(0, 5)}
                      {c.programme ? ` · ${c.programme}` : ""}
                    </option>
                  ))}
                </select>
                {classes.length === 0 && (
                  <p className="text-xs text-yellow-400 mt-1">
                    No trial-enabled classes. Enable them in Trial Settings first.
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs text-jai-text block mb-1">Date</label>
                <input
                  type="date"
                  value={form.bookingDate}
                  onChange={(e) => setForm({ ...form, bookingDate: e.target.value })}
                  className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2 text-sm"
                />
                {selectedClass && (
                  <p className="text-xs text-jai-text mt-1">
                    Time slot: {timeSlot}
                  </p>
                )}
              </div>
            </div>

            {formErr && (
              <p className="text-xs text-red-400">{formErr}</p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => !saving && setShowAdd(false)}
                className="flex-1 py-2 border border-jai-border rounded-lg text-sm min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || classes.length === 0}
                className="flex-1 py-2 bg-jai-blue text-white rounded-lg text-sm min-h-[44px] font-medium disabled:opacity-50"
              >
                {saving ? "Saving…" : "Create booking"}
              </button>
            </div>
          </form>
        </div>
      )}

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
