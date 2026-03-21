"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { User, PtPackage, isAdmin } from "@/lib/types/database";

const PACKAGE_TYPES = [
  { value: "single", label: "Single Session", sessions: 1 },
  { value: "10-pack", label: "10-Pack", sessions: 10 },
  { value: "20-pack", label: "20-Pack", sessions: 20 },
  { value: "buddy", label: "Buddy Package", sessions: 10 },
];

function statusBadge(status: string) {
  switch (status) {
    case "active":
      return "bg-green-500/10 text-green-400";
    case "expired":
      return "bg-red-500/10 text-red-400";
    default:
      return "bg-jai-text/10 text-jai-text";
  }
}

export function PtPageClient({
  ptPackages,
  profile,
  nextSessions,
  members,
  coaches,
}: {
  ptPackages: PtPackage[];
  profile: User;
  nextSessions: Record<string, string>;
  members: User[];
  coaches: User[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const admin = isAdmin(profile.role);

  const [showForm, setShowForm] = useState(false);
  const [editingPkg, setEditingPkg] = useState<PtPackage | null>(null);
  const [memberId, setMemberId] = useState("");
  const [coachId, setCoachId] = useState("");
  const [packageType, setPackageType] = useState("10-pack");
  const [totalSessions, setTotalSessions] = useState(10);
  const [sessionsUsed, setSessionsUsed] = useState(0);
  const [expiryDate, setExpiryDate] = useState("");
  const [saving, setSaving] = useState(false);

  const openAdd = () => {
    setEditingPkg(null);
    setMemberId("");
    setCoachId("");
    setPackageType("10-pack");
    setTotalSessions(10);
    setSessionsUsed(0);
    setExpiryDate("");
    setShowForm(true);
  };

  const openEdit = (pkg: PtPackage) => {
    setEditingPkg(pkg);
    setMemberId(pkg.user_id);
    setCoachId(pkg.preferred_coach_id || "");
    setTotalSessions(pkg.total_sessions);
    setSessionsUsed(pkg.sessions_used);
    setExpiryDate(pkg.expiry_date || "");
    setShowForm(true);
  };

  const handlePackageTypeChange = (type: string) => {
    setPackageType(type);
    const preset = PACKAGE_TYPES.find((p) => p.value === type);
    if (preset && !editingPkg) {
      setTotalSessions(preset.sessions);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberId || !coachId) return;
    setSaving(true);

    const payload = {
      user_id: memberId,
      preferred_coach_id: coachId,
      total_sessions: totalSessions,
      sessions_used: sessionsUsed,
      expiry_date: expiryDate || null,
      status: sessionsUsed >= totalSessions ? "completed" : "active",
    };

    if (editingPkg) {
      await supabase.from("pt_packages").update(payload).eq("id", editingPkg.id);
    } else {
      await supabase.from("pt_packages").insert(payload);
    }

    setShowForm(false);
    setSaving(false);
    router.refresh();
  };

  // Coach simplified view
  if (!admin) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">My PT Clients</h1>

        <div className="space-y-2">
          {ptPackages.map((pt) => (
            <div key={pt.id} className="bg-jai-card border border-jai-border rounded-xl p-4">
              <p className="font-medium">{pt.member?.full_name || "—"}</p>
              <p className="text-jai-text text-sm mt-1">
                {nextSessions[pt.user_id]
                  ? `Next session: ${new Date(nextSessions[pt.user_id]).toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
                  : "No upcoming session"}
              </p>
            </div>
          ))}
          {ptPackages.length === 0 && (
            <div className="bg-jai-card border border-jai-border rounded-xl p-4 text-jai-text text-center">
              No PT clients assigned
            </div>
          )}
        </div>
      </div>
    );
  }

  // Admin full view
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">PT Packages</h1>
        <button
          onClick={showForm ? () => setShowForm(false) : openAdd}
          className="bg-jai-blue text-white px-4 py-2 rounded-lg text-sm font-medium min-h-[44px]"
        >
          {showForm ? "Cancel" : "Add Package"}
        </button>
      </div>

      {/* Add/Edit form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-jai-card border border-jai-border rounded-xl p-4 space-y-4">
          <h2 className="font-semibold">{editingPkg ? "Edit Package" : "New PT Package"}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-jai-text mb-1">Member</label>
              <select
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
                required
                className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2 text-white min-h-[44px]"
              >
                <option value="">Select member</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.full_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-jai-text mb-1">Coach</label>
              <select
                value={coachId}
                onChange={(e) => setCoachId(e.target.value)}
                required
                className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2 text-white min-h-[44px]"
              >
                <option value="">Select coach</option>
                {coaches.map((c) => (
                  <option key={c.id} value={c.id}>{c.full_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-jai-text mb-1">Package Type</label>
              <select
                value={packageType}
                onChange={(e) => handlePackageTypeChange(e.target.value)}
                className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2 text-white min-h-[44px]"
              >
                {PACKAGE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-jai-text mb-1">Total Sessions</label>
              <input
                type="number"
                value={totalSessions}
                onChange={(e) => setTotalSessions(Number(e.target.value))}
                min={1}
                required
                className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2 text-white min-h-[44px]"
              />
            </div>
            <div>
              <label className="block text-sm text-jai-text mb-1">Sessions Used</label>
              <input
                type="number"
                value={sessionsUsed}
                onChange={(e) => setSessionsUsed(Number(e.target.value))}
                min={0}
                max={totalSessions}
                required
                className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2 text-white min-h-[44px]"
              />
            </div>
            <div>
              <label className="block text-sm text-jai-text mb-1">Expiry Date</label>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2 text-white min-h-[44px]"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-jai-blue text-white py-2 rounded-lg font-medium min-h-[44px] disabled:opacity-50"
          >
            {saving ? "Saving..." : editingPkg ? "Update Package" : "Create Package"}
          </button>
        </form>
      )}

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {ptPackages.map((pt) => {
          const remaining = pt.total_sessions - pt.sessions_used;
          return (
            <div
              key={pt.id}
              className="bg-jai-card border border-jai-border rounded-xl p-3"
              onClick={() => openEdit(pt)}
            >
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm">{pt.member?.full_name || "—"}</p>
                <span className={`text-sm font-medium ${remaining <= 0 ? "text-red-400" : remaining <= 2 ? "text-yellow-400" : "text-jai-blue"}`}>
                  {pt.sessions_used}/{pt.total_sessions}
                </span>
              </div>
              {pt.coach?.full_name && (
                <p className="text-jai-blue text-xs mt-1">Coach: {pt.coach.full_name}</p>
              )}
              <div className="flex items-center justify-between mt-1">
                <p className="text-jai-text text-xs">
                  {remaining} remaining{pt.expiry_date ? ` · Exp: ${pt.expiry_date}` : ""}
                </p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusBadge(pt.status)}`}>
                  {pt.status}
                </span>
              </div>
            </div>
          );
        })}
        {ptPackages.length === 0 && (
          <div className="bg-jai-card border border-jai-border rounded-xl p-4 text-jai-text text-center">
            No PT packages found
          </div>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-jai-card border border-jai-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-jai-border text-left text-sm text-jai-text">
              <th className="p-4">Member</th>
              <th className="p-4">Coach</th>
              <th className="p-4">Package</th>
              <th className="p-4">Remaining</th>
              <th className="p-4">Expiry</th>
              <th className="p-4">Status</th>
              <th className="p-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {ptPackages.map((pt) => {
              const remaining = pt.total_sessions - pt.sessions_used;
              return (
                <tr key={pt.id} className="border-b border-jai-border last:border-b-0">
                  <td className="p-4 font-medium">{pt.member?.full_name || "—"}</td>
                  <td className="p-4 text-jai-text">{pt.coach?.full_name || "—"}</td>
                  <td className="p-4">
                    <span className={remaining <= 0 ? "text-red-400" : remaining <= 2 ? "text-yellow-400" : "text-jai-blue"}>
                      {pt.sessions_used}/{pt.total_sessions}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className={remaining <= 0 ? "text-red-400" : remaining <= 2 ? "text-yellow-400" : ""}>
                      {remaining}
                    </span>
                  </td>
                  <td className="p-4 text-jai-text">{pt.expiry_date || "—"}</td>
                  <td className="p-4">
                    <span className={`text-xs px-2 py-1 rounded-full ${statusBadge(pt.status)}`}>
                      {pt.status}
                    </span>
                  </td>
                  <td className="p-4">
                    <button
                      onClick={() => openEdit(pt)}
                      className="text-jai-blue hover:text-blue-300 text-sm min-h-[44px] min-w-[44px]"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              );
            })}
            {ptPackages.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-jai-text text-center">
                  No PT packages found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
