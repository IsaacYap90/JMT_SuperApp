"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { User, Leave, LeaveType, isAdmin } from "@/lib/types/database";
import { cancelLeave, submitLeave, reviewLeave } from "@/app/actions/leave";
import { DateRangePicker } from "./date-range-picker";

const LEAVE_TYPES: { value: LeaveType; label: string }[] = [
  { value: "annual", label: "Annual Leave" },
  { value: "sick", label: "MC (Medical Certificate)" },
  { value: "hospital", label: "Hospital Leave" },
  { value: "emergency", label: "Emergency Leave" },
];

// Annual entitlements (days per year)
const LEAVE_ENTITLEMENTS: Record<string, { label: string; days: number; color: string }> = {
  annual: { label: "Annual", days: 14, color: "bg-blue-500" },
  sick: { label: "MC", days: 14, color: "bg-yellow-500" },
  hospital: { label: "Hospital", days: 60, color: "bg-red-500" },
};

function statusBadge(status: string) {
  switch (status) {
    case "approved":
      return "bg-green-500/10 text-green-400";
    case "rejected":
      return "bg-red-500/10 text-red-400";
    default:
      return "bg-yellow-500/10 text-yellow-400";
  }
}

function countLeaveDays(startDate: string, endDate: string | null, isHalfDay: boolean): number {
  const end = endDate || startDate;
  const start = new Date(startDate);
  const endD = new Date(end);
  let days = 0;
  const current = new Date(start);
  while (current <= endD) {
    // Skip Sundays (gym closed)
    if (current.getDay() !== 0) {
      days++;
    }
    current.setDate(current.getDate() + 1);
  }
  return isHalfDay ? days * 0.5 : days;
}

function formatDateRange(startDate: string, endDate: string | null): string {
  if (!endDate || endDate === startDate) return startDate;
  return `${startDate} → ${endDate}`;
}

export function LeavePageClient({
  leaves,
  profile,
  userId,
}: {
  leaves: Leave[];
  profile: User;
  userId: string;
}) {
  const router = useRouter();
  const admin = isAdmin(profile.role);

  const [showForm, setShowForm] = useState(false);
  const [leaveStartDate, setLeaveStartDate] = useState("");
  const [leaveEndDate, setLeaveEndDate] = useState("");
  const [leaveType, setLeaveType] = useState<LeaveType>("annual");
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Calculate leave balances for the current year
  const leaveBalances = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const approvedLeaves = leaves.filter(
      (l) => l.status === "approved" && l.leave_date.startsWith(String(currentYear))
    );

    return Object.entries(LEAVE_ENTITLEMENTS).map(([type, config]) => {
      const used = approvedLeaves
        .filter((l) => l.leave_type === type)
        .reduce((sum, l) => sum + countLeaveDays(l.leave_date, l.leave_end_date, l.is_half_day), 0);
      return {
        type,
        label: config.label,
        total: config.days,
        used,
        remaining: config.days - used,
        color: config.color,
      };
    });
  }, [leaves]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveStartDate || !reason.trim()) return;
    setError(null);
    setSaving(true);
    try {
      await submitLeave({
        leave_date: leaveStartDate,
        leave_end_date: leaveEndDate || leaveStartDate,
        leave_type: leaveType,
        is_half_day: isHalfDay,
        reason: reason.trim(),
      });
      setShowForm(false);
      setLeaveStartDate("");
      setLeaveEndDate("");
      setIsHalfDay(false);
      setReason("");
      router.refresh();
    } catch (err) {
      setError(`Failed to submit leave: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
    setSaving(false);
  };

  const handleAction = async (leaveId: string, action: "approved" | "rejected") => {
    setError(null);
    setActioningId(leaveId);
    try {
      await reviewLeave(leaveId, action);
      router.refresh();
    } catch (err) {
      setError(`Failed to ${action === "approved" ? "approve" : "reject"} leave: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
    setActioningId(null);
  };

  const handleCancel = async (leaveId: string) => {
    setError(null);
    setActioningId(leaveId);
    try {
      await cancelLeave(leaveId);
      router.refresh();
    } catch (err) {
      setError(`Failed to cancel leave: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
    setActioningId(null);
  };

  const canCancel = (leave: Leave) => {
    if (admin) return false;
    return leave.coach_id === userId && leave.leave_date >= new Date().toISOString().split("T")[0];
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {admin ? "Leave Requests" : "My Leave"}
        </h1>
        {!admin && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-jai-blue text-white px-4 py-2 rounded-lg text-sm font-medium min-h-[44px]"
          >
            {showForm ? "Cancel" : "Apply Leave"}
          </button>
        )}
      </div>

      {/* Leave Balance Cards */}
      {!admin && (
        <div className="grid grid-cols-3 gap-3">
          {leaveBalances.map((bal) => (
            <div key={bal.type} className="bg-jai-card border border-jai-border rounded-xl p-3">
              <p className="text-[10px] sm:text-xs text-jai-text mb-1">{bal.label}</p>
              <p className="text-xl sm:text-2xl font-bold text-white">
                {bal.remaining}
                <span className="text-xs sm:text-sm text-jai-text font-normal">/{bal.total}</span>
              </p>
              {/* Progress bar */}
              <div className="mt-2 h-1.5 bg-jai-border rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${bal.color}`}
                  style={{ width: `${Math.max(0, Math.min(100, (bal.remaining / bal.total) * 100))}%` }}
                />
              </div>
              <p className="text-[10px] text-jai-text mt-1">{bal.used} used</p>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Leave application form (coach only) */}
      {showForm && !admin && (
        <form onSubmit={handleSubmit} className="bg-jai-card border border-jai-border rounded-xl p-4 space-y-4">
          <DateRangePicker
            startDate={leaveStartDate}
            endDate={leaveEndDate}
            onStartChange={setLeaveStartDate}
            onEndChange={setLeaveEndDate}
          />
          {leaveStartDate && leaveEndDate && (
            <p className="text-xs text-jai-text">
              {countLeaveDays(leaveStartDate, leaveEndDate, isHalfDay)} day(s) <span className="text-jai-text/50">· Sundays excluded</span>
            </p>
          )}
          <div>
            <label className="block text-sm text-jai-text mb-1">Type</label>
            <select
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value as LeaveType)}
              className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2 text-white min-h-[44px]"
            >
              {LEAVE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="flex items-center gap-3 cursor-pointer py-1">
              <div
                onClick={() => setIsHalfDay(!isHalfDay)}
                className={`relative w-11 h-6 rounded-full transition-colors ${isHalfDay ? "bg-jai-blue" : "bg-jai-border"}`}
              >
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${isHalfDay ? "translate-x-5" : ""}`} />
              </div>
              <span className="text-sm text-white">
                Half Day <span className="text-xs text-jai-text">(off before 6:30pm, teaching evening)</span>
              </span>
            </label>
          </div>
          <div>
            <label className="block text-sm text-jai-text mb-1">Reason</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              rows={3}
              className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2 text-white"
              placeholder="Reason for leave..."
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-jai-blue text-white py-2 rounded-lg font-medium min-h-[44px] disabled:opacity-50"
          >
            {saving ? "Submitting..." : "Submit Leave Request"}
          </button>
        </form>
      )}

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {leaves.map((leave) => (
          <div key={leave.id} className="bg-jai-card border border-jai-border rounded-xl p-3">
            <div className="flex items-center justify-between">
              {admin && (
                <p className="font-medium text-sm">{leave.coach?.full_name || "—"}</p>
              )}
              <p className={`text-sm ${admin ? "" : "font-medium"}`}>
                {formatDateRange(leave.leave_date, leave.leave_end_date)}
              </p>
              <span className={`text-[10px] px-2 py-0.5 rounded-full capitalize ${statusBadge(leave.status)}`}>
                {leave.status}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-jai-text text-xs capitalize">{leave.leave_type.replace("_", " ")} leave</p>
              {leave.is_half_day && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">Half Day</span>
              )}
              <span className="text-[10px] text-jai-text">
                ({countLeaveDays(leave.leave_date, leave.leave_end_date, leave.is_half_day)} day{countLeaveDays(leave.leave_date, leave.leave_end_date, leave.is_half_day) !== 1 ? "s" : ""})
              </span>
            </div>
            <p className="text-jai-text text-xs mt-1">{leave.reason}</p>
            {admin && leave.status === "pending" && (
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => handleAction(leave.id, "approved")}
                  disabled={actioningId === leave.id}
                  className="flex-1 bg-green-500/10 text-green-400 py-1.5 rounded-lg text-xs font-medium min-h-[44px] disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  onClick={() => handleAction(leave.id, "rejected")}
                  disabled={actioningId === leave.id}
                  className="flex-1 bg-red-500/10 text-red-400 py-1.5 rounded-lg text-xs font-medium min-h-[44px] disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            )}
            {canCancel(leave) && (
              <button
                onClick={() => handleCancel(leave.id)}
                disabled={actioningId === leave.id}
                className="w-full mt-2 bg-red-500/10 text-red-400 border border-red-500/20 py-1.5 rounded-lg text-xs font-medium min-h-[44px] disabled:opacity-50"
              >
                Cancel Leave
              </button>
            )}
          </div>
        ))}
        {leaves.length === 0 && (
          <div className="bg-jai-card border border-jai-border rounded-xl p-4 text-jai-text text-center">
            No leave requests
          </div>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-jai-card border border-jai-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-jai-border text-left text-sm text-jai-text">
              {admin && <th className="p-4">Coach</th>}
              <th className="p-4">Date</th>
              <th className="p-4">Type</th>
              <th className="p-4">Duration</th>
              <th className="p-4">Reason</th>
              <th className="p-4">Status</th>
              <th className="p-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {leaves.map((leave) => (
              <tr key={leave.id} className="border-b border-jai-border last:border-b-0">
                {admin && (
                  <td className="p-4 font-medium">{leave.coach?.full_name || "—"}</td>
                )}
                <td className="p-4">{formatDateRange(leave.leave_date, leave.leave_end_date)}</td>
                <td className="p-4 capitalize">{leave.leave_type.replace("_", " ")}</td>
                <td className="p-4">
                  <span className="text-xs text-jai-text">
                    {countLeaveDays(leave.leave_date, leave.leave_end_date, leave.is_half_day)} day(s)
                  </span>
                  {leave.is_half_day && (
                    <span className="ml-1 text-xs px-2 py-1 rounded-full bg-blue-500/10 text-blue-400">Half</span>
                  )}
                </td>
                <td className="p-4 text-jai-text">{leave.reason}</td>
                <td className="p-4">
                  <span className={`text-xs px-2 py-1 rounded-full capitalize ${statusBadge(leave.status)}`}>
                    {leave.status}
                  </span>
                </td>
                <td className="p-4">
                  {admin && leave.status === "pending" ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAction(leave.id, "approved")}
                        disabled={actioningId === leave.id}
                        className="text-green-400 hover:text-green-300 text-sm font-medium min-h-[44px] min-w-[44px] disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleAction(leave.id, "rejected")}
                        disabled={actioningId === leave.id}
                        className="text-red-400 hover:text-red-300 text-sm font-medium min-h-[44px] min-w-[44px] disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  ) : canCancel(leave) ? (
                    <button
                      onClick={() => handleCancel(leave.id)}
                      disabled={actioningId === leave.id}
                      className="text-red-400 hover:text-red-300 text-sm font-medium disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  ) : admin ? (
                    <span className="text-jai-text text-sm">
                      {leave.reviewer?.full_name || "—"}
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
            {leaves.length === 0 && (
              <tr>
                <td colSpan={admin ? 7 : 6} className="p-4 text-jai-text text-center">
                  No leave requests
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
