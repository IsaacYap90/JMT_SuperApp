"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createTrialBooking } from "@/app/actions/trials";

interface AvailableSlot {
  classId: string;
  className: string;
  date: string;
  dateLabel: string;
  dayName: string;
  timeSlot: string;
  spotsLeft: number;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function BookingPageClient({
  programme,
  programmeLabel,
  slots,
}: {
  programme: string;
  programmeLabel: string;
  slots: AvailableSlot[];
}) {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Get unique dates
  const dates = Array.from(new Set(slots.map((s) => s.date)));

  // Auto-select first date
  if (!selectedDate && dates.length > 0) {
    setSelectedDate(dates[0]);
  }

  const dateSlots = slots.filter((s) => s.date === selectedDate);

  const handleBook = async () => {
    if (!selectedSlot || !name.trim() || !phone.trim()) return;
    setError("");
    setSubmitting(true);

    try {
      const booking = await createTrialBooking({
        name: name.trim(),
        phone: phone.trim(),
        programme,
        classId: selectedSlot.classId,
        bookingDate: selectedSlot.date,
        timeSlot: selectedSlot.timeSlot,
      });
      router.push(
        `/book/confirmation?id=${booking.id}&name=${encodeURIComponent(name.trim())}&date=${selectedSlot.dateLabel}&time=${encodeURIComponent(selectedSlot.timeSlot)}&class=${encodeURIComponent(selectedSlot.className)}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Booking failed");
      setSubmitting(false);
    }
  };

  if (slots.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold">{programmeLabel} Trial Class</h2>
          <p className="text-jai-text text-sm mt-1">Book your free trial session</p>
        </div>
        <div className="bg-jai-card border border-jai-border rounded-xl p-6 text-center">
          <p className="text-jai-text">No trial slots available at the moment. Please check back later.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">{programmeLabel} Trial Class</h2>
        <p className="text-jai-text text-sm mt-1">Book your free trial session</p>
      </div>

      {/* Date picker - horizontal scroll */}
      <div>
        <p className="text-xs text-jai-text mb-2 uppercase tracking-wide font-semibold">Select a date</p>
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
          {dates.map((date) => {
            const d = new Date(date + "T00:00:00+08:00");
            const dayName = DAY_NAMES[d.getDay()];
            const dayNum = d.getDate();
            const month = d.toLocaleDateString("en-SG", { month: "short" });
            const active = selectedDate === date;
            const slotsForDate = slots.filter((s) => s.date === date);
            const totalSpots = slotsForDate.reduce((sum, s) => sum + s.spotsLeft, 0);

            return (
              <button
                key={date}
                onClick={() => {
                  setSelectedDate(date);
                  setSelectedSlot(null);
                }}
                className={`flex-shrink-0 w-16 py-3 rounded-xl text-center transition-colors ${
                  active
                    ? "bg-jai-blue text-white"
                    : "bg-jai-card border border-jai-border text-jai-text"
                }`}
              >
                <p className="text-[10px] uppercase">{dayName}</p>
                <p className="text-lg font-bold mt-0.5">{dayNum}</p>
                <p className="text-[10px]">{month}</p>
                {totalSpots > 0 && (
                  <p className={`text-[9px] mt-1 ${active ? "text-white/70" : "text-green-400"}`}>
                    {totalSpots} spot{totalSpots > 1 ? "s" : ""}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Time slots for selected date */}
      {selectedDate && (
        <div>
          <p className="text-xs text-jai-text mb-2 uppercase tracking-wide font-semibold">Available classes</p>
          <div className="space-y-2">
            {dateSlots.map((slot) => (
              <button
                key={`${slot.classId}-${slot.date}`}
                onClick={() => setSelectedSlot(slot)}
                className={`w-full text-left p-4 rounded-xl border transition-colors ${
                  selectedSlot?.classId === slot.classId && selectedSlot?.date === slot.date
                    ? "bg-jai-blue/10 border-jai-blue"
                    : "bg-jai-card border-jai-border"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{slot.className}</p>
                    <p className="text-jai-text text-xs mt-0.5">{slot.timeSlot}</p>
                  </div>
                  <span className="text-xs text-green-400">
                    {slot.spotsLeft} spot{slot.spotsLeft > 1 ? "s" : ""} left
                  </span>
                </div>
              </button>
            ))}
            {dateSlots.length === 0 && (
              <p className="text-jai-text text-sm text-center py-4">No classes available on this date</p>
            )}
          </div>
        </div>
      )}

      {/* Booking form */}
      {selectedSlot && (
        <div className="bg-jai-card border border-jai-border rounded-xl p-4 space-y-4">
          <h3 className="font-semibold text-sm">Your Details</h3>
          <div className="bg-jai-bg rounded-lg p-3 text-sm">
            <p className="font-medium">{selectedSlot.className}</p>
            <p className="text-jai-text text-xs">
              {selectedSlot.dateLabel} · {selectedSlot.timeSlot}
            </p>
          </div>
          <div>
            <label className="text-xs text-jai-text block mb-1">Name</label>
            <input
              type="text"
              placeholder="Your full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2.5 text-sm min-h-[44px]"
            />
          </div>
          <div>
            <label className="text-xs text-jai-text block mb-1">Phone Number</label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-jai-text">+65</span>
              <input
                type="tel"
                placeholder="9123 4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 8))}
                className="flex-1 bg-jai-bg border border-jai-border rounded-lg px-3 py-2.5 text-sm min-h-[44px]"
              />
            </div>
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button
            onClick={handleBook}
            disabled={submitting || !name.trim() || phone.length < 8}
            className="w-full py-3 bg-jai-blue text-white text-sm font-semibold rounded-lg min-h-[48px] disabled:opacity-50"
          >
            {submitting ? "Booking..." : "Confirm Booking"}
          </button>
        </div>
      )}
    </div>
  );
}
