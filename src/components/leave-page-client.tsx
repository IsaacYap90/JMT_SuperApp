"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { User, Leave, LeaveType, isAdmin } from "@/lib/types/database";

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
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveDate || !reason.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("leaves").insert({
      coach_id: userId,
      leave_date: leaveDate,
      leave_type: leaveType,
      reason: reason.trim(),
      status: "pending",
    });
    if (!error) {
      setShowForm(false);
      setLeaveDate("");
      setReason("");
      router.refresh();
    }
    setSaving(false);
  };

  const handleAction = async (leaveId: string, action: "approved" | "rejected") => {
    setActioningId(leaveId);
    await supabase
      .from("leaves")
      .update({
        status: action,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", leaveId);
    setActioningId(null);
    router.refresh();
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
            <div className="flex items-center justify-between mt-1">
              <p className="text-jai-text text-xs capitalize">{leave.leave_type.replace("_", " ")} leave</p>
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
              <th className="p-4">Reason</th>
              <th className="p-4">Status</th>
              {admin && <th className="p-4">Actions</th>}
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
                <td className="p-4 text-jai-text">{leave.reason}</td>
                <td className="p-4">
                  <span className={`text-xs px-2 py-1 rounded-full capitalize ${statusBadge(leave.status)}`}>
                    {leave.status}
                  </span>
                </td>
                {admin && (
                  <td className="p-4">
                    {leave.status === "pending" ? (
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
                    ) : (
                      <span className="text-jai-text text-sm">
                        {leave.reviewer?.full_name || "—"}
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {leaves.length === 0 && (
              <tr>
                <td colSpan={admin ? 6 : 4} className="p-4 text-jai-text text-center">
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
