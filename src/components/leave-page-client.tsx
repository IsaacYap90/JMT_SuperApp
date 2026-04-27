"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { User, Leave, LeaveType, isAdmin } from "@/lib/types/database";
import { cancelLeave, submitLeave, reviewLeave, addInLieuCredit } from "@/app/actions/leave";
import { DateRangePicker } from "./date-range-picker";
import { PullToRefresh } from "./pull-to-refresh";

const LEAVE_TYPES: { value: LeaveType; label: string }[] = [
  { value: "annual", label: "Annual Leave" },
  { value: "sick", label: "MC (Medical Certificate)" },
  { value: "hospital", label: "Hospitalisation Leave" },
  { value: "in_lieu", label: "Off in Lieu" },
  { value: "emergency", label: "Emergency Leave" },
];

// Annual entitlements (days per year). All coaches get the same quota,
// refreshed on 1 Jan. "In lieu" has no entitlement — it's a credit system;
// balance is just "earned - used", with earning tracked manually for now.
const LEAVE_ENTITLEMENTS: Record<string, { label: string; days: number; color: string; isCredit?: boolean }> = {
  annual: { label: "Annual", days: 14, color: "bg-blue-500" },
  sick: { label: "MC", days: 14, color: "bg-yellow-500" },
  hospital: { label: "Hospitalisation", days: 60, color: "bg-red-500" },
  in_lieu: { label: "Off in Lieu", days: 0, color: "bg-purple-500", isCredit: true },
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

function statusStrip(status: string) {
  switch (status) {
    case "approved":
      return "bg-green-400";
    case "rejected":
      return "bg-red-400";
    default:
      return "bg-yellow-400";
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
  coaches = [],
  inLieuCredits = [],
}: {
  leaves: Leave[];
  profile: User;
  userId: string;
  coaches?: Pick<User, "id" | "full_name" | "role">[];
  inLieuCredits?: { coach_id: string; days: number }[];
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
  // Admin-only: when set, the leave form is submitting on behalf of this coach
  // (Jeremy logging an MC / annual leave directly onto a coach's profile).
  const [targetCoachId, setTargetCoachId] = useState<string | null>(null);

  // Calculate leave balances for the current user for the current year.
  // Admins see all coaches' leaves in the list below, but the balance cards
  // are always scoped to the currently-logged-in user's own leaves.
  const leaveBalances = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const myApproved = leaves.filter(
      (l) =>
        l.status === "approved" &&
        l.coach_id === userId &&
        l.leave_date.startsWith(String(currentYear))
    );
    // Also count pending (not yet approved) so users don't accidentally
    // over-apply. Pending is shown as a separate number.
    const myPending = leaves.filter(
      (l) =>
        l.status === "pending" &&
        l.coach_id === userId &&
        l.leave_date.startsWith(String(currentYear))
    );

    return Object.entries(LEAVE_ENTITLEMENTS).map(([type, config]) => {
      const used = myApproved
        .filter((l) => l.leave_type === type)
        .reduce((sum, l) => sum + countLeaveDays(l.leave_date, l.leave_end_date, l.is_half_day), 0);
      const pending = myPending
        .filter((l) => l.leave_type === type)
        .reduce((sum, l) => sum + countLeaveDays(l.leave_date, l.leave_end_date, l.is_half_day), 0);
      // For credit-based types (OIL), total = earned credits instead of fixed entitlement
      const earned = config.isCredit
        ? inLieuCredits.filter((cr) => cr.coach_id === userId).reduce((sum, cr) => sum + cr.days, 0)
        : 0;
      const total = config.isCredit ? earned : config.days;
      return {
        type,
        label: config.label,
        total,
        used,
        pending,
        remaining: total - used,
        isCredit: config.isCredit || false,
        color: config.color,
      };
    });
  }, [leaves, userId, inLieuCredits]);

  // Admin-only: per-coach annual + MC balances. Jeremy wants to see every
  // coach's remaining days at a glance instead of his own (he's the boss).
  const coachBalances = useMemo(() => {
    if (!admin) return [];
    const currentYear = new Date().getFullYear();
    return coaches.map((c) => {
      const approved = leaves.filter(
        (l) =>
          l.status === "approved" &&
          l.coach_id === c.id &&
          l.leave_date.startsWith(String(currentYear))
      );
      const usedFor = (type: string) =>
        approved
          .filter((l) => l.leave_type === type)
          .reduce((sum, l) => sum + countLeaveDays(l.leave_date, l.leave_end_date, l.is_half_day), 0);
      const inLieuEarned = inLieuCredits
        .filter((cr) => cr.coach_id === c.id)
        .reduce((sum, cr) => sum + Number(cr.days || 0), 0);
      const inLieuUsed = usedFor("in_lieu");
      return {
        id: c.id,
        name: c.full_name,
        annualUsed: usedFor("annual"),
        annualTotal: LEAVE_ENTITLEMENTS.annual.days,
        mcUsed: usedFor("sick"),
        mcTotal: LEAVE_ENTITLEMENTS.sick.days,
        hospUsed: usedFor("hospital"),
        hospTotal: LEAVE_ENTITLEMENTS.hospital.days,
        inLieuEarned,
        inLieuUsed,
        inLieuRemaining: inLieuEarned - inLieuUsed,
      };
    });
  }, [admin, coaches, leaves, inLieuCredits]);

  // Off-in-lieu credit modal state (admin only)
  const [creditCoachId, setCreditCoachId] = useState<string | null>(null);
  const [creditDays, setCreditDays] = useState("1");
  const [creditReason, setCreditReason] = useState("");
  const [creditSaving, setCreditSaving] = useState(false);

  const openCreditModal = (coachId: string) => {
    setCreditCoachId(coachId);
    setCreditDays("1");
    setCreditReason("");
  };

  const handleAddCredit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!creditCoachId) return;
    setCreditSaving(true);
    setError(null);
    try {
      await addInLieuCredit({
        coach_id: creditCoachId,
        days: parseFloat(creditDays),
        reason: creditReason.trim(),
      });
      setCreditCoachId(null);
      router.refresh();
    } catch (err) {
      setError(`Failed to add credit: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setCreditSaving(false);
    }
  };

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
        target_coach_id: targetCoachId || undefined,
      });
      setShowForm(false);
      setTargetCoachId(null);
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
    // Admins (Jeremy) can cancel any leave on any coach profile, including past
    // ones — used for correcting mistakes / removing MC entries after the fact.
    if (admin) return true;
    return leave.coach_id === userId && leave.leave_date >= new Date().toISOString().split("T")[0];
  };

  const openAdminLeaveForm = (coachId: string) => {
    setTargetCoachId(coachId);
    setLeaveStartDate("");
    setLeaveEndDate("");
    setLeaveType("sick");
    setIsHalfDay(false);
    setReason("");
    setShowForm(true);
  };

  const closeAdminLeaveForm = () => {
    setShowForm(false);
    setTargetCoachId(null);
  };

  return (
    <PullToRefresh>
    <div className="space-y-6 max-w-5xl mx-auto">
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

      {/* Admin view: per-coach balances (Jeremy sees every coach, not himself) */}
      {admin && (
        <div>
          <p className="text-xs text-jai-text mb-2">
            Coach balances · {new Date().getFullYear()}
          </p>
          <div className="space-y-2">
            {coachBalances.length === 0 && (
              <p className="text-xs text-jai-text">No other coaches found.</p>
            )}
            {coachBalances.map((c) => (
              <div key={c.id} className="bg-jai-card border border-jai-border rounded-xl p-3">
                <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                  <p className="text-sm font-medium text-white">{c.name}</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openAdminLeaveForm(c.id)}
                      className="text-[10px] px-2 py-1 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/30 hover:bg-blue-500/20"
                    >
                      + Apply Leave
                    </button>
                    <button
                      onClick={() => openCreditModal(c.id)}
                      className="text-[10px] px-2 py-1 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/30 hover:bg-purple-500/20"
                    >
                      + Off in Lieu
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div>
                    <p className="text-jai-text">Annual</p>
                    <p className="text-white font-semibold">
                      {c.annualTotal - c.annualUsed}
                      <span className="text-jai-text font-normal">/{c.annualTotal}</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-jai-text">MC</p>
                    <p className="text-white font-semibold">
                      {c.mcTotal - c.mcUsed}
                      <span className="text-jai-text font-normal">/{c.mcTotal}</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-jai-text">Hospital</p>
                    <p className="text-white font-semibold">
                      {c.hospTotal - c.hospUsed}
                      <span className="text-jai-text font-normal">/{c.hospTotal}</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-jai-text">Off in Lieu</p>
                    <p className="text-white font-semibold">
                      {c.inLieuRemaining}
                      <span className="text-jai-text font-normal"> left</span>
                    </p>
                    <p className="text-[10px] text-jai-text">{c.inLieuEarned} earned · {c.inLieuUsed} used</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Admin: add Off-in-Lieu credit modal */}
      {creditCoachId && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 pb-24 sm:pb-4"
          onClick={() => !creditSaving && setCreditCoachId(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleAddCredit}
            className="bg-jai-card border border-jai-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Add Off in Lieu credit</h2>
              <button type="button" onClick={() => !creditSaving && setCreditCoachId(null)} className="text-jai-text text-xl px-2">×</button>
            </div>
            <p className="text-xs text-jai-text">
              For: {coaches.find((c) => c.id === creditCoachId)?.full_name}
            </p>
            <div>
              <label className="text-xs text-jai-text block mb-1">Days</label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                value={creditDays}
                onChange={(e) => setCreditDays(e.target.value)}
                className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-jai-text block mb-1">Reason</label>
              <textarea
                value={creditReason}
                onChange={(e) => setCreditReason(e.target.value)}
                rows={3}
                placeholder="e.g. Worked Sunday event 5 Apr"
                className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => !creditSaving && setCreditCoachId(null)}
                className="flex-1 py-2 border border-jai-border rounded-lg text-sm min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creditSaving || !creditReason.trim() || !(parseFloat(creditDays) > 0)}
                className="flex-1 py-2 bg-purple-500 text-white rounded-lg text-sm min-h-[44px] font-medium disabled:opacity-50"
              >
                {creditSaving ? "Saving…" : "Add credit"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Coach view: own balance cards */}
      {!admin && (
      <div>
        <p className="text-xs text-jai-text mb-2">
          My {new Date().getFullYear()} balance
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {leaveBalances.map((bal) => (
            <div key={bal.type} className="bg-jai-card border border-jai-border rounded-xl p-3">
              <p className="text-[10px] sm:text-xs text-jai-text mb-1">{bal.label}</p>
              {bal.isCredit ? (
                <>
                  <p className="text-xl sm:text-2xl font-bold text-white">
                    {bal.remaining}
                    <span className="text-xs sm:text-sm text-jai-text font-normal"> left</span>
                  </p>
                  <div className="mt-2 h-1.5 bg-jai-border rounded-full overflow-hidden">
                    {bal.total > 0 && (
                      <div
                        className="h-full rounded-full bg-purple-500"
                        style={{ width: `${Math.max(0, Math.min(100, (bal.remaining / bal.total) * 100))}%` }}
                      />
                    )}
                  </div>
                  <p className="text-[10px] text-jai-text mt-1">
                    {bal.total} earned · {bal.used} used
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xl sm:text-2xl font-bold text-white">
                    {bal.remaining}
                    <span className="text-xs sm:text-sm text-jai-text font-normal">/{bal.total}</span>
                  </p>
                  <div className="mt-2 h-1.5 bg-jai-border rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${bal.color}`}
                      style={{ width: `${Math.max(0, Math.min(100, (bal.remaining / bal.total) * 100))}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-jai-text mt-1">
                    {bal.used} used{bal.pending > 0 ? ` · ${bal.pending} pending` : ""}
                  </p>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Leave application form — coaches apply for themselves, admins can
          apply on behalf of a coach via the "+ Apply Leave" button on each
          coach card (targetCoachId gates admin submission). */}
      {showForm && (!admin || targetCoachId) && (
        <form onSubmit={handleSubmit} className="bg-jai-card border border-jai-border rounded-xl p-4 space-y-4">
          {admin && targetCoachId && (
            <div className="flex items-center justify-between bg-blue-500/10 border border-blue-500/30 rounded-lg px-3 py-2">
              <p className="text-xs text-blue-300">
                Applying leave for <span className="font-semibold text-white">{coaches.find((c) => c.id === targetCoachId)?.full_name || "coach"}</span>
              </p>
              <button
                type="button"
                onClick={closeAdminLeaveForm}
                className="text-blue-300 text-xs underline"
              >
                cancel
              </button>
            </div>
          )}
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
          <div key={leave.id} className="relative bg-jai-card border border-jai-border rounded-xl p-3 pl-4 overflow-hidden">
            <span className={`absolute left-0 top-0 bottom-0 w-1 ${statusStrip(leave.status)}`} aria-hidden />
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
    </PullToRefresh>
  );
}
