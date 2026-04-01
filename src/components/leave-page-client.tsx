"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { User, Leave, LeaveType, isAdmin } from "@/lib/types/database";
import { cancelLeave } from "@/app/actions/leave";

const LEAVE_TYPES: { value: LeaveType; label: string }[] = [
  { value: "sick", label: "Sick Leave" },
  { value: "annual", label: "Annual Leave" },
  { value: "emergency", label: "Emergency Leave" },
];

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
  const supabase = createClient();
  const admin = isAdmin(profile.role);

  const [showForm, setShowForm] = useState(false);
  const [leaveDate, setLeaveDate] = useState("");
  const [leaveType, setLeaveType] = useState<LeaveType>("annual");
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveDate || !reason.trim()) return;
    setError(null);
    setSaving(true);
    const { error: insertError } = await supabase.from("leaves").insert({
      coach_id: userId,
      leave_date: leaveDate,
      leave_type: leaveType,
      is_half_day: isHalfDay,
      reason: reason.trim(),
      status: "pending",
    });
    if (insertError) {
      setError(`Failed to submit leave: ${insertError.message}`);
    } else {
      setShowForm(false);
      setLeaveDate("");
      setIsHalfDay(false);
      setReason("");
      router.refresh();
    }
    setSaving(false);
  };

  const handleAction = async (leaveId: string, action: "approved" | "rejected") => {
    setError(null);
    setActioningId(leaveId);
    const { error: updateError } = await supabase
      .from("leaves")
      .update({
        status: action,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", leaveId);
    if (updateError) {
      setError(`Failed to ${action === "approved" ? "approve" : "reject"} leave: ${updateError.message}`);
    } else {
      router.refresh();
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
    // Coaches can cancel their own leaves if the date hasn't passed
    if (admin) return false; // Admin uses approve/reject
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

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Leave application form (coach only) */}
      {showForm && !admin && (
        <form onSubmit={handleSubmit} className="bg-jai-card border border-jai-border rounded-xl p-4 space-y-4">
          <div>
            <label className="block text-sm text-jai-text mb-1">Date</label>
            <input
              type="date"
              value={leaveDate}
              onChange={(e) => setLeaveDate(e.target.value)}
              required
              className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2 text-white min-h-[44px]"
            />
          </div>
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
              <span className="text-sm text-white">Half Day</span>
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
              <p className={`text-sm ${admin ? "" : "font-medium"}`}>{leave.leave_date}</p>
              <span className={`text-[10px] px-2 py-0.5 rounded-full capitalize ${statusBadge(leave.status)}`}>
                {leave.status}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-jai-text text-xs capitalize">{leave.leave_type.replace("_", " ")} leave</p>
              {leave.is_half_day && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">Half Day</span>
              )}
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
                <td className="p-4">{leave.leave_date}</td>
                <td className="p-4 capitalize">{leave.leave_type.replace("_", " ")}</td>
                <td className="p-4">
                  {leave.is_half_day ? (
                    <span className="text-xs px-2 py-1 rounded-full bg-blue-500/10 text-blue-400">Half Day</span>
                  ) : (
                    <span className="text-xs text-jai-text">Full Day</span>
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
