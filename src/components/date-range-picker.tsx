"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartChange: (date: string) => void;
  onEndChange: (date: string) => void;
}

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function DateRangePicker({ startDate, endDate, onStartChange, onEndChange }: DateRangePickerProps) {
  const today = new Date();
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [selectingEnd, setSelectingEnd] = useState(false);

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    // Monday = 0, Sunday = 6 (ISO)
    let dayOfWeek = firstDay.getDay() - 1;
    if (dayOfWeek < 0) dayOfWeek = 6;

    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const days: (Date | null)[] = [];

    // Leading blanks
    for (let i = 0; i < dayOfWeek; i++) days.push(null);
    // Days
    for (let d = 1; d <= daysInMonth; d++) days.push(new Date(viewYear, viewMonth, d));

    return days;
  }, [viewMonth, viewYear]);

  const handleDayClick = (date: Date) => {
    const dateStr = toDateStr(date);
    const todayStr = toDateStr(today);

    // Don't allow past dates
    if (dateStr < todayStr) return;

    if (!selectingEnd || !startDate) {
      // Selecting start date
      onStartChange(dateStr);
      onEndChange(dateStr);
      setSelectingEnd(true);
    } else {
      // Selecting end date
      if (dateStr < startDate) {
        // If clicked before start, reset start
        onStartChange(dateStr);
        onEndChange(dateStr);
        setSelectingEnd(true);
      } else {
        onEndChange(dateStr);
        setSelectingEnd(false);
      }
    }
  };

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const getDayStyle = (date: Date) => {
    const dateStr = toDateStr(date);
    const todayStr = toDateStr(today);
    const isPast = dateStr < todayStr;
    const isSunday = date.getDay() === 0;
    const isStart = startDate === dateStr;
    const isEnd = endDate === dateStr;
    const isInRange = startDate && endDate && dateStr > startDate && dateStr < endDate;
    const isToday = dateStr === todayStr;

    if (isPast) return "text-white/20 cursor-not-allowed";
    if (isStart || isEnd) return "bg-jai-blue text-white font-bold";
    if (isInRange) return isSunday ? "bg-jai-blue/10 text-white/40 line-through" : "bg-jai-blue/20 text-white";
    if (isToday) return "ring-1 ring-jai-blue text-white";
    if (isSunday) return "text-white/30";
    return "text-white hover:bg-white/10";
  };

  return (
    <div className="bg-jai-bg border border-jai-border rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-white">
          {MONTHS[viewMonth]} {viewYear}
        </h3>
        <div className="flex gap-2">
          <button type="button" onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/60">
            <ChevronLeft size={16} />
          </button>
          <button type="button" onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/60">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Instruction */}
      <p className="text-[10px] text-jai-text mb-3">
        {!startDate
          ? "Tap start date"
          : selectingEnd
            ? "Now tap end date"
            : "Date range selected"
        }
      </p>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-0 mb-1">
        {DAYS.map((d) => (
          <div key={d} className={`text-center text-[10px] font-medium py-1 ${d === "SUN" ? "text-white/30" : "text-jai-text"}`}>
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-0">
        {calendarDays.map((date, i) => {
          if (!date) return <div key={`blank-${i}`} />;

          const dateStr = toDateStr(date);
          const isStart = startDate === dateStr;
          const isEnd = endDate === dateStr && endDate !== startDate;
          const isInRange = startDate && endDate && dateStr > startDate && dateStr < endDate;

          return (
            <div
              key={dateStr}
              className="relative flex items-center justify-center"
            >
              {/* Range background strip */}
              {(isInRange || isEnd) && (
                <div className="absolute inset-y-0.5 left-0 right-1/2 bg-jai-blue/15" />
              )}
              {(isInRange || isStart) && startDate !== endDate && (
                <div className="absolute inset-y-0.5 left-1/2 right-0 bg-jai-blue/15" />
              )}
              <button
                type="button"
                onClick={() => handleDayClick(date)}
                className={`relative z-10 w-9 h-9 rounded-full text-sm transition-colors ${getDayStyle(date)}`}
              >
                {date.getDate()}
              </button>
            </div>
          );
        })}
      </div>

      {/* Selected range summary */}
      {startDate && endDate && (
        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-jai-text">
            <span className="text-white font-medium">{startDate}</span>
            {startDate !== endDate && (
              <> → <span className="text-white font-medium">{endDate}</span></>
            )}
          </span>
          <button
            type="button"
            onClick={() => {
              onStartChange("");
              onEndChange("");
              setSelectingEnd(false);
            }}
            className="text-red-400 text-[10px]"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
