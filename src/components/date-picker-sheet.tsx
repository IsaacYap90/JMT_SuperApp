"use client";

import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  value: string; // YYYY-MM-DD
  onChange: (v: string) => void;
  onClose: () => void;
  minDate?: string; // YYYY-MM-DD
  title?: string;
};

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function parseYmd(s: string): { y: number; m: number; d: number } | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

function todayYmd(): string {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function DatePickerSheet({ open, value, onChange, onClose, minDate, title = "Pick a date" }: Props) {
  const initial = parseYmd(value) || parseYmd(todayYmd())!;
  const [viewY, setViewY] = useState(initial.y);
  const [viewM, setViewM] = useState(initial.m); // 1-12

  useEffect(() => {
    if (open) {
      const p = parseYmd(value) || parseYmd(todayYmd())!;
      setViewY(p.y);
      setViewM(p.m);
    }
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  if (!open) return null;

  const firstDow = new Date(viewY, viewM - 1, 1).getDay();
  const daysInMonth = new Date(viewY, viewM, 0).getDate();
  const today = todayYmd();
  const min = minDate || "";

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const prevMonth = () => {
    if (viewM === 1) { setViewM(12); setViewY(viewY - 1); }
    else setViewM(viewM - 1);
  };
  const nextMonth = () => {
    if (viewM === 12) { setViewM(1); setViewY(viewY + 1); }
    else setViewM(viewM + 1);
  };

  const pick = (d: number) => {
    const ymd = `${viewY}-${String(viewM).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (min && ymd < min) return;
    onChange(ymd);
    onClose();
  };

  const selected = parseYmd(value);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 animate-toast-in" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:max-w-sm bg-jai-card border-t sm:border border-jai-border sm:rounded-2xl rounded-t-2xl p-4 pb-6 animate-toast-in"
      >
        <div className="flex items-center justify-between mb-3">
          <button onClick={prevMonth} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-jai-bg/40" aria-label="Previous month">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-wider text-jai-text/60">{title}</p>
            <p className="text-sm font-semibold">{MONTH_NAMES[viewM - 1]} {viewY}</p>
          </div>
          <button onClick={nextMonth} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-jai-bg/40" aria-label="Next month">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map((w, i) => (
            <div key={i} className="text-[10px] text-jai-text/50 text-center py-1">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (d === null) return <div key={i} />;
            const ymd = `${viewY}-${String(viewM).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const isToday = ymd === today;
            const isSelected = selected && selected.y === viewY && selected.m === viewM && selected.d === d;
            const isDisabled = min && ymd < min;
            return (
              <button
                key={i}
                onClick={() => pick(d)}
                disabled={!!isDisabled}
                className={`h-10 rounded-lg text-sm font-medium transition-colors ${
                  isSelected
                    ? "bg-jai-blue text-white"
                    : isDisabled
                    ? "text-jai-text/20 cursor-not-allowed"
                    : isToday
                    ? "bg-jai-blue/15 text-jai-blue border border-jai-blue/30"
                    : "text-jai-text hover:bg-jai-bg/40"
                }`}
              >
                {d}
              </button>
            );
          })}
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={() => { onChange(today); onClose(); }}
            className="flex-1 min-h-[44px] py-2.5 text-sm font-medium rounded-lg bg-jai-bg/40 border border-jai-border text-jai-text hover:bg-jai-bg/60"
          >
            Today
          </button>
          <button
            onClick={onClose}
            className="flex-1 min-h-[44px] py-2.5 text-sm font-medium rounded-lg bg-jai-card border border-jai-border text-jai-text/70 hover:bg-jai-card/60"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
