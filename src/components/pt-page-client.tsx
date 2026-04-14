"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { User, PtPackage, PtSession, isAdmin } from "@/lib/types/database";

// 30-minute time slots from 6:00am to 10:00pm for PT scheduling
const TIME_SLOTS = Array.from({ length: 33 }, (_, i) => {
  const totalMinutes = 6 * 60 + i * 30;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const label = `${h12}:${String(m).padStart(2, "0")}${suffix}`;
  return { value, label };
});
import {
  createPtClient,
  updatePtClient,
  deletePtClient,
  createPtPackage,
  updatePtPackage,
  createPtSession,
  updatePtSession,
  updateSessionStatus,
  deletePtSession,
  autoExpirePackages,
  getNextWeekPtCount,
  copyPtSessionsToNextWeek,
} from "@/app/actions/pt";
import type { ContractDraft } from "@/app/actions/pt";
import { ContractDraftBanner, ContractDraftReviewForm } from "@/components/contract-draft-review";
import { isPublicHoliday } from "@/lib/sg-holidays";

const DAY_NAMES_PT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getPtDates() {
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
  today.setHours(0, 0, 0, 0);
  const dates: { date: Date; label: string; dateNum: number; isToday: boolean; isoDate: string }[] = [];
  for (let i = -7; i <= 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    dates.push({
      date: d,
      label: DAY_NAMES_PT[d.getDay()],
      dateNum: d.getDate(),
      isToday: i === 0,
      isoDate: iso,
    });
  }
  return dates;
}

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
    case "completed":
      return "bg-jai-text/10 text-jai-text";
    default:
      return "bg-jai-text/10 text-jai-text";
  }
}

function sessionStatusBadge(status: string) {
  switch (status) {
    case "scheduled":
      return "bg-blue-500/10 text-blue-400";
    case "confirmed":
      return "bg-green-500/10 text-green-400";
    case "completed":
      return "bg-jai-text/10 text-jai-text";
    case "cancelled":
      return "bg-red-500/10 text-red-400";
    case "no_show":
      return "bg-yellow-500/10 text-yellow-400";
    default:
      return "bg-jai-text/10 text-jai-text";
  }
}

export function PtPageClient({
  ptPackages,
  ptSessions: initialSessions,
  profile,
  nextSessions,
  members,
  coaches,
  contractDrafts = [],
}: {
  ptPackages: PtPackage[];
  ptSessions?: PtSession[];
  profile: User;
  nextSessions: Record<string, string>;
  members: User[];
  coaches: User[];
  contractDrafts?: ContractDraft[];
}) {
  const router = useRouter();
  const admin = isAdmin(profile.role);

  // Tab state for admin
  const [tab, setTab] = useState<"sessions" | "clients">("sessions");
  const [copying, setCopying] = useState(false);

  async function handleCopyToNextWeek() {
    setCopying(true);
    try {
      const existingCount = await getNextWeekPtCount();
      if (existingCount > 0) {
        const proceed = confirm(
          `Next week already has ${existingCount} PT session${existingCount > 1 ? "s" : ""}. Copy anyway?`
        );
        if (!proceed) {
          setCopying(false);
          return;
        }
      }
      const { copied } = await copyPtSessionsToNextWeek();
      if (copied === 0) {
        alert("No PT sessions found in the current week to copy.");
      } else {
        alert(`Copied ${copied} PT session${copied > 1 ? "s" : ""} to next week.`);
        router.refresh();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to copy sessions");
    } finally {
      setCopying(false);
    }
  }

  // Coach filter for sessions
  const [filterCoachId, setFilterCoachId] = useState("");

  // Package form state
  const [showPkgForm, setShowPkgForm] = useState(false);
  const [editingPkg, setEditingPkg] = useState<PtPackage | null>(null);
  const [memberId, setMemberId] = useState("");
  const [coachId, setCoachId] = useState("");
  const [packageType, setPackageType] = useState("10-pack");
  const [totalSessions, setTotalSessions] = useState(10);
  const [sessionsUsed, setSessionsUsed] = useState(0);
  const [expiryDate, setExpiryDate] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");

  // Session form state
  const [showSessionForm, setShowSessionForm] = useState(false);
  const [sessMemberId, setSessMemberId] = useState("");
  const [sessCoachId, setSessCoachId] = useState("");
  const [sessDate, setSessDate] = useState("");
  const [sessTime, setSessTime] = useState("10:00");
  const [sessDuration, setSessDuration] = useState(60);

  // Inline PT client creation
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [creatingClient, setCreatingClient] = useState(false);

  // Member search
  const [sessMemSearch, setSessMemSearch] = useState("");
  const [pkgMemSearch, setPkgMemSearch] = useState("");

  // Quick schedule from package
  const [quickSchedulePkg, setQuickSchedulePkg] = useState<PtPackage | null>(null);
  const [quickDate, setQuickDate] = useState("");
  const [quickTime, setQuickTime] = useState("10:00");

  const [saving, setSaving] = useState(false);
  const [sessions, setSessions] = useState<PtSession[]>(initialSessions || []);

  // Date scroller state
  const ptDates = getPtDates();
  const ptTodayIdx = ptDates.findIndex((d) => d.isToday);
  const [selectedDateIdx, setSelectedDateIdx] = useState(ptTodayIdx >= 0 ? ptTodayIdx : 0);
  const dateScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (dateScrollRef.current) {
      const btn = dateScrollRef.current.children[selectedDateIdx] as HTMLElement;
      if (btn) btn.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [selectedDateIdx]);

  // Edit session state
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editSessCoachId, setEditSessCoachId] = useState("");
  const [editSessDate, setEditSessDate] = useState("");
  const [editSessTime, setEditSessTime] = useState("");
  const [editSessDuration, setEditSessDuration] = useState(60);

  // Contract draft review state
  const [reviewingDraft, setReviewingDraft] = useState<ContractDraft | null>(null);

  // Auto-expire packages on mount
  useEffect(() => {
    if (admin) {
      autoExpirePackages().catch(() => {});
    }
  }, [admin]);

  // Package handlers
  const openAddPkg = () => {
    setEditingPkg(null);
    setMemberId("");
    setCoachId("");
    setPackageType("10-pack");
    setTotalSessions(10);
    setSessionsUsed(0);
    setExpiryDate("");
    setGuardianName("");
    setGuardianPhone("");
    setShowPkgForm(true);
  };

  const openEditPkg = (pkg: PtPackage) => {
    setEditingPkg(pkg);
    setMemberId(pkg.user_id);
    setCoachId(pkg.preferred_coach_id || "");
    setTotalSessions(pkg.total_sessions);
    setSessionsUsed(pkg.sessions_used);
    setExpiryDate(pkg.expiry_date || "");
    setGuardianName(pkg.guardian_name || "");
    setGuardianPhone(pkg.guardian_phone || "");
    setShowPkgForm(true);
  };

  const handlePkgTypeChange = (type: string) => {
    setPackageType(type);
    const preset = PACKAGE_TYPES.find((p) => p.value === type);
    if (preset && !editingPkg) setTotalSessions(preset.sessions);
  };

  const handlePkgSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberId || !coachId) return;
    setSaving(true);
    try {
      const payload = {
        user_id: memberId,
        preferred_coach_id: coachId,
        total_sessions: totalSessions,
        sessions_used: sessionsUsed,
        expiry_date: expiryDate || null,
        guardian_name: guardianName.trim() || null,
        guardian_phone: guardianPhone.trim() || null,
      };
      if (editingPkg) {
        await updatePtPackage(editingPkg.id, payload);
      } else {
        await createPtPackage(payload);
      }
      setShowPkgForm(false);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save package");
    }
    setSaving(false);
  };

  // Local members state so new clients appear immediately
  const [localMembers, setLocalMembers] = useState<User[]>(members);

  // Session handlers
  const handleSessionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessMemberId || !sessCoachId || !sessDate) return;
    setSaving(true);
    try {
      const scheduledAt = `${sessDate}T${sessTime}:00+08:00`;
      const newSession = await createPtSession({
        coach_id: sessCoachId,
        member_id: sessMemberId,
        scheduled_at: scheduledAt,
        duration_minutes: sessDuration,
      });
      if (newSession) {
        setSessions((prev) =>
          [...prev, newSession as unknown as PtSession].sort((a, b) =>
            a.scheduled_at.localeCompare(b.scheduled_at)
          )
        );
      }
      setShowSessionForm(false);
      setSessMemberId("");
      setSessMemSearch("");
      setSessCoachId("");
      setSessDate("");
      setSessTime("10:00");
      setSessDuration(60);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to schedule session");
    }
    setSaving(false);
  };

  const openEditSession = (s: PtSession) => {
    const dt = new Date(s.scheduled_at);
    const dateStr = dt.toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
    const timeStr = dt.toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Singapore" });
    setEditingSessionId(s.id);
    setEditSessCoachId(s.coach_id || "");
    setEditSessDate(dateStr);
    setEditSessTime(timeStr);
    setEditSessDuration(s.duration_minutes || 60);
  };

  const handleEditSessionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSessionId || !editSessDate || !editSessCoachId) return;
    setSaving(true);
    try {
      const scheduledAt = `${editSessDate}T${editSessTime}:00+08:00`;
      const updated = await updatePtSession(editingSessionId, {
        coach_id: editSessCoachId,
        scheduled_at: scheduledAt,
        duration_minutes: editSessDuration,
      });
      if (updated) {
        setSessions((prev) =>
          prev.map((s) => (s.id === editingSessionId ? (updated as unknown as PtSession) : s))
            .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
        );
      }
      setEditingSessionId(null);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update session");
    }
    setSaving(false);
  };

  const handleDeleteSession = async (id: string) => {
    try {
      await deletePtSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete session");
    }
  };

  const handleStatusChange = async (
    sessionId: string,
    newStatus: "completed" | "cancelled" | "no_show"
  ) => {
    try {
      await updateSessionStatus(sessionId, newStatus);
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, status: newStatus } : s))
      );
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update status");
    }
  };

  // Inline client creation
  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName.trim()) return;
    setCreatingClient(true);
    try {
      const newUser = await createPtClient(newClientName.trim(), newClientPhone.trim());
      setLocalMembers((prev) => [...prev, newUser as unknown as User].sort((a, b) => a.full_name.localeCompare(b.full_name)));
      setShowNewClient(false);
      setNewClientName("");
      setNewClientPhone("");
      // Auto-select the new client in whichever form is open
      if (showSessionForm) {
        setSessMemberId(newUser.id);
        setSessMemSearch("");
      }
      if (showPkgForm) {
        setMemberId(newUser.id);
        setPkgMemSearch("");
      }
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create client");
    }
    setCreatingClient(false);
  };

  // Quick schedule from package card
  const handleQuickSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickSchedulePkg || !quickDate) return;
    setSaving(true);
    try {
      const scheduledAt = `${quickDate}T${quickTime}:00+08:00`;
      await createPtSession({
        coach_id: quickSchedulePkg.preferred_coach_id || "",
        member_id: quickSchedulePkg.user_id,
        scheduled_at: scheduledAt,
        duration_minutes: 60,
      });
      setQuickSchedulePkg(null);
      setQuickDate("");
      setQuickTime("10:00");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to schedule session");
    }
    setSaving(false);
  };

  // Filter sessions by date + coach
  const selectedPtDate = ptDates[selectedDateIdx]?.isoDate || "";
  const filteredSessions = sessions.filter((s) => {
    const sessDate = new Date(s.scheduled_at).toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
    if (sessDate !== selectedPtDate) return false;
    if (filterCoachId && s.coach_id !== filterCoachId) return false;
    return true;
  });

  // Coach simplified view
  if (!admin) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">My PT Clients</h1>
        <div className="space-y-2">
          {ptPackages.map((pt) => {
            const contactPhone = pt.guardian_phone || pt.member?.phone || "";
            const waPhone = contactPhone.replace(/\D/g, "");
            const contactLabel = pt.guardian_name
              ? `${contactPhone} (${pt.guardian_name})`
              : contactPhone;
            const remaining = pt.total_sessions - pt.sessions_used;
            return (
              <div key={pt.id} className="bg-jai-card border border-jai-border rounded-xl p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{pt.member?.full_name || "—"}</p>
                  {waPhone && (
                    <a
                      href={`https://wa.me/65${waPhone}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs px-2 py-1 rounded-md bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-colors"
                    >
                      {contactLabel}
                    </a>
                  )}
                </div>
                <p className="text-jai-text text-sm mt-1">
                  {remaining} session{remaining === 1 ? "" : "s"} left
                </p>
                <p className="text-jai-text text-sm mt-1">
                  {nextSessions[pt.user_id]
                    ? `Next session: ${new Date(nextSessions[pt.user_id]).toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
                    : "No upcoming session"}
                </p>
              </div>
            );
          })}
          {ptPackages.length === 0 && (
            <div className="bg-jai-card border border-jai-border rounded-xl p-4 text-jai-text text-center">
              No PT clients assigned
            </div>
          )}
        </div>
      </div>
    );
  }

  // Admin view with tabs
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold">PT Management</h1>
        <button
          onClick={handleCopyToNextWeek}
          disabled={copying}
          className="px-3 py-2 bg-jai-card border border-jai-border text-jai-text text-sm rounded-lg hover:text-white hover:border-green-500/50 transition-colors disabled:opacity-50"
        >
          {copying ? "Copying..." : "Copy PT → Next Week"}
        </button>
      </div>

      {/* Contract draft banner */}
      {admin && contractDrafts.length > 0 && (
        <ContractDraftBanner
          drafts={contractDrafts}
          onReview={(draft) => setReviewingDraft(draft)}
        />
      )}

      {/* Contract draft review modal */}
      {reviewingDraft && (
        <ContractDraftReviewForm
          draft={reviewingDraft}
          coaches={coaches.map((c) => ({ id: c.id, full_name: c.full_name }))}
          members={members.map((m) => ({ id: m.id, full_name: m.full_name, phone: m.phone }))}
          onClose={() => setReviewingDraft(null)}
        />
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-jai-card border border-jai-border rounded-lg p-1">
        <button
          onClick={() => setTab("sessions")}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
            tab === "sessions" ? "bg-jai-blue text-white" : "text-jai-text hover:text-white"
          }`}
        >
          Sessions
        </button>
        <button
          onClick={() => setTab("clients")}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
            tab === "clients" ? "bg-jai-blue text-white" : "text-jai-text hover:text-white"
          }`}
        >
          Clients
        </button>
      </div>

      {/* SESSIONS TAB */}
      {tab === "sessions" && (
        <div className="space-y-4">
          {/* Date scroller */}
          <div className="relative">
            <div
              ref={dateScrollRef}
              className="flex gap-1 overflow-x-auto scrollbar-hide pb-2 -mx-1 px-1"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              {ptDates.map((d, i) => {
                const isPH = !!isPublicHoliday(d.isoDate);
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDateIdx(i)}
                    className={`flex flex-col items-center min-w-[52px] py-2 px-2 rounded-xl transition-colors ${
                      i === selectedDateIdx
                        ? isPH ? "bg-red-500 text-white" : "bg-green-500 text-white"
                        : isPH
                        ? "bg-red-500/10 text-red-400"
                        : d.isToday
                        ? "bg-green-500/10 text-green-400"
                        : "text-jai-text hover:bg-white/5"
                    }`}
                  >
                    <span className="text-[10px] font-medium uppercase">{d.label}</span>
                    <span className="text-lg font-bold">{d.dateNum}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected day label */}
          <p className="text-sm text-jai-text capitalize">
            {ptDates[selectedDateIdx]?.date.toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
              timeZone: "Asia/Singapore",
            })}
          </p>

          {/* Coach filter + Add button */}
          <div className="flex items-center gap-3">
            <select
              value={filterCoachId}
              onChange={(e) => setFilterCoachId(e.target.value)}
              className="flex-1 bg-jai-card border border-jai-border rounded-lg px-3 py-2.5 text-sm min-h-[44px]"
            >
              <option value="">All Coaches</option>
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </select>
            <button
              onClick={() => setShowSessionForm(!showSessionForm)}
              className="px-4 py-2.5 bg-jai-blue text-white text-sm rounded-lg hover:bg-jai-blue/90 min-h-[44px] whitespace-nowrap"
            >
              {showSessionForm ? "Cancel" : "+ Add Session"}
            </button>
          </div>

          {/* Add session form */}
          {showSessionForm && (
            <form
              onSubmit={handleSessionSubmit}
              className="bg-jai-card border border-jai-border rounded-xl p-4 space-y-4"
            >
              <h3 className="font-semibold text-sm">Schedule PT Session</h3>

              {/* Inline new client button */}
              {!showNewClient && (
                <button
                  type="button"
                  onClick={() => setShowNewClient(true)}
                  className="text-xs text-jai-blue hover:underline"
                >
                  + Create new PT client
                </button>
              )}

              {/* Inline new client form */}
              {showNewClient && (
                <div className="bg-jai-bg border border-jai-border rounded-lg p-3 space-y-3">
                  <h4 className="text-xs font-semibold text-jai-text">New PT Client</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="Full name"
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                      className="w-full bg-jai-card border border-jai-border rounded-lg px-3 py-2 text-sm min-h-[44px]"
                    />
                    <input
                      type="tel"
                      placeholder="Phone (e.g. 91234567)"
                      value={newClientPhone}
                      onChange={(e) => setNewClientPhone(e.target.value)}
                      className="w-full bg-jai-card border border-jai-border rounded-lg px-3 py-2 text-sm min-h-[44px]"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleCreateClient}
                      disabled={creatingClient || !newClientName.trim()}
                      className="px-3 py-2 bg-green-600 text-white text-xs rounded-lg min-h-[44px] disabled:opacity-50"
                    >
                      {creatingClient ? "Creating..." : "Create Client"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowNewClient(false)}
                      className="px-3 py-2 text-jai-text text-xs rounded-lg min-h-[44px]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <label className="text-xs text-jai-text block mb-1">Member</label>
                  <input
                    type="text"
                    placeholder="Search client..."
                    value={sessMemSearch || localMembers.find((m) => m.id === sessMemberId)?.full_name || ""}
                    onChange={(e) => {
                      setSessMemSearch(e.target.value);
                      if (!e.target.value) setSessMemberId("");
                    }}
                    onFocus={() => {
                      if (sessMemberId) {
                        setSessMemSearch(localMembers.find((m) => m.id === sessMemberId)?.full_name || "");
                      }
                    }}
                    className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2.5 text-sm min-h-[44px]"
                  />
                  {sessMemSearch && !sessMemberId && (() => {
                    const filtered = localMembers.filter((m) => m.full_name.toLowerCase().includes(sessMemSearch.toLowerCase()));
                    return (
                    <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-jai-card border border-jai-border rounded-lg max-h-40 overflow-y-auto shadow-lg">
                      {filtered.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              setSessMemberId(m.id);
                              setSessMemSearch("");
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-jai-blue/10 transition-colors"
                          >
                            {m.full_name}
                            {m.phone ? <span className="text-jai-text ml-1">({m.phone})</span> : ""}
                          </button>
                        ))}
                      {filtered.length === 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setNewClientName(sessMemSearch);
                            setShowNewClient(true);
                            setSessMemSearch("");
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-jai-blue hover:bg-jai-blue/10 transition-colors"
                        >
                          + Create &quot;{sessMemSearch}&quot; as new client
                        </button>
                      )}
                    </div>
                    );
                  })()}
                </div>
                <div>
                  <label className="text-xs text-jai-text block mb-1">Coach</label>
                  <select
                    value={sessCoachId}
                    onChange={(e) => setSessCoachId(e.target.value)}
                    required
                    className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2.5 text-sm min-h-[44px]"
                  >
                    <option value="">Select coach</option>
                    {coaches.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.full_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-jai-text block mb-1">Date</label>
                  <input
                    type="date"
                    value={sessDate}
                    onChange={(e) => setSessDate(e.target.value)}
                    min={new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" })}
                    required
                    className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2.5 text-sm min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="text-xs text-jai-text block mb-1">Time</label>
                  <select
                    value={sessTime}
                    onChange={(e) => setSessTime(e.target.value)}
                    required
                    className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2.5 text-sm min-h-[44px]"
                  >
                    <option value="">Select time</option>
                    {TIME_SLOTS.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-jai-text block mb-1">Duration (minutes)</label>
                <select
                  value={sessDuration}
                  onChange={(e) => setSessDuration(Number(e.target.value))}
                  className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2.5 text-sm min-h-[44px]"
                >
                  <option value={30}>30 min</option>
                  <option value={45}>45 min</option>
                  <option value={60}>60 min</option>
                  <option value={90}>90 min</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={saving}
                className="w-full py-2.5 bg-jai-blue text-white text-sm rounded-lg font-medium min-h-[44px] disabled:opacity-50"
              >
                {saving ? "Scheduling..." : "Schedule Session"}
              </button>
            </form>
          )}

          {/* Session list */}
          <div className="space-y-2">
            {filteredSessions.map((s) => {
              const dt = new Date(s.scheduled_at);
              const dateStr = dt.toLocaleDateString("en-SG", {
                weekday: "short",
                day: "numeric",
                month: "short",
                timeZone: "Asia/Singapore",
              });
              const timeStr = dt.toLocaleTimeString("en-SG", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
                timeZone: "Asia/Singapore",
              });
              const isUpcoming =
                s.status === "scheduled" || s.status === "confirmed";

              return (
                <div
                  key={s.id}
                  className="bg-jai-card border border-jai-border rounded-xl p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">
                          {s.member?.full_name || "—"}
                        </p>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full capitalize ${sessionStatusBadge(s.status)}`}
                        >
                          {s.status.replace("_", " ")}
                        </span>
                      </div>
                      {s.member?.phone && (
                        <a href={`tel:${s.member.phone}`} className="text-jai-blue text-xs mt-0.5 inline-block hover:underline">
                          {s.member.phone}
                        </a>
                      )}
                      <p className="text-jai-text text-sm mt-0.5">
                        {dateStr} · {timeStr} · {s.duration_minutes || 60}min
                      </p>
                      {s.coach && (
                        <p className="text-jai-blue text-xs mt-0.5">
                          Coach: {s.coach.full_name}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 ml-3">
                      {/* Edit button */}
                      {isUpcoming && (
                        <button
                          onClick={() => openEditSession(s)}
                          className="text-jai-text hover:text-jai-blue p-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      )}
                      {/* Delete button */}
                      <button
                        onClick={() => handleDeleteSession(s.id)}
                        className="text-jai-text hover:text-red-400 p-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Edit form */}
                  {editingSessionId === s.id && (
                    <form onSubmit={handleEditSessionSubmit} className="mt-3 border-t border-jai-border pt-3 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-jai-text block mb-1">Coach</label>
                          <select
                            value={editSessCoachId}
                            onChange={(e) => setEditSessCoachId(e.target.value)}
                            required
                            className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2.5 text-sm min-h-[44px]"
                          >
                            {coaches.map((c) => (
                              <option key={c.id} value={c.id}>{c.full_name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-jai-text block mb-1">Duration</label>
                          <select
                            value={editSessDuration}
                            onChange={(e) => setEditSessDuration(Number(e.target.value))}
                            className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2.5 text-sm min-h-[44px]"
                          >
                            <option value={30}>30 min</option>
                            <option value={45}>45 min</option>
                            <option value={60}>60 min</option>
                            <option value={90}>90 min</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-jai-text block mb-1">Date</label>
                          <input
                            type="date"
                            value={editSessDate}
                            onChange={(e) => setEditSessDate(e.target.value)}
                            required
                            className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2.5 text-sm min-h-[44px]"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-jai-text block mb-1">Time</label>
                          <select
                            value={editSessTime}
                            onChange={(e) => setEditSessTime(e.target.value)}
                            required
                            className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2.5 text-sm min-h-[44px]"
                          >
                            <option value="">Select time</option>
                            {TIME_SLOTS.map((t) => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={saving}
                          className="flex-1 py-2 bg-jai-blue text-white text-xs rounded-lg font-medium min-h-[44px] disabled:opacity-50"
                        >
                          {saving ? "Saving..." : "Save Changes"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingSessionId(null)}
                          className="px-4 py-2 text-jai-text text-xs rounded-lg min-h-[44px]"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Status action buttons for upcoming sessions */}
                  {isUpcoming && editingSessionId !== s.id && (
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => handleStatusChange(s.id, "completed")}
                        className="flex-1 py-2 bg-green-600/10 text-green-400 border border-green-500/20 text-xs rounded-lg min-h-[44px] font-medium"
                      >
                        Completed
                      </button>
                      <button
                        onClick={() => handleStatusChange(s.id, "cancelled")}
                        className="flex-1 py-2 bg-red-500/10 text-red-400 border border-red-500/20 text-xs rounded-lg min-h-[44px] font-medium"
                      >
                        Cancelled
                      </button>
                      <button
                        onClick={() => handleStatusChange(s.id, "no_show")}
                        className="flex-1 py-2 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 text-xs rounded-lg min-h-[44px] font-medium"
                      >
                        No Show
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {filteredSessions.length === 0 && (
              <div className="bg-jai-card border border-jai-border rounded-xl p-4 text-jai-text text-center text-sm">
                No PT sessions on this day
                {filterCoachId ? " for this coach" : ""}
              </div>
            )}
          </div>
        </div>
      )}

      {/* CLIENTS TAB (merged Packages + Clients) */}
      {tab === "clients" && (
        <div className="space-y-4">
          <div className="flex justify-end gap-3">
            {!showNewClient && !showPkgForm && (
              <button
                onClick={() => setShowNewClient(true)}
                className="px-4 py-2.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 min-h-[44px]"
              >
                + New Client
              </button>
            )}
            <button
              onClick={showPkgForm ? () => setShowPkgForm(false) : openAddPkg}
              className="px-4 py-2.5 bg-jai-blue text-white text-sm rounded-lg hover:bg-jai-blue/90 min-h-[44px]"
            >
              {showPkgForm ? "Cancel" : "+ Add Package"}
            </button>
          </div>

          {/* Inline new client form */}
          {showNewClient && tab === "clients" && (
            <form
              onSubmit={handleCreateClient}
              className="bg-jai-card border border-jai-border rounded-xl p-4 space-y-3"
            >
              <h3 className="font-semibold text-sm">Create PT Client</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-jai-text block mb-1">Full Name</label>
                  <input
                    type="text"
                    placeholder="e.g. John Tan"
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    required
                    className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2.5 text-sm min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="text-xs text-jai-text block mb-1">Phone</label>
                  <input
                    type="tel"
                    placeholder="e.g. 91234567"
                    value={newClientPhone}
                    onChange={(e) => setNewClientPhone(e.target.value)}
                    className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2.5 text-sm min-h-[44px]"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={creatingClient || !newClientName.trim()}
                  className="flex-1 py-2.5 bg-green-600 text-white text-sm rounded-lg font-medium min-h-[44px] disabled:opacity-50"
                >
                  {creatingClient ? "Creating..." : "Create Client"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewClient(false)}
                  className="px-4 py-2.5 text-jai-text text-sm rounded-lg min-h-[44px]"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Package form */}
          {showPkgForm && (
            <form
              onSubmit={handlePkgSubmit}
              className="bg-jai-card border border-jai-border rounded-xl p-4 space-y-4"
            >
              <h3 className="font-semibold text-sm">
                {editingPkg ? "Edit Package" : "New PT Package"}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <label className="text-xs text-jai-text block mb-1">Member</label>
                  <input
                    type="text"
                    placeholder="Search client..."
                    value={pkgMemSearch || localMembers.find((m) => m.id === memberId)?.full_name || ""}
                    onChange={(e) => {
                      setPkgMemSearch(e.target.value);
                      if (!e.target.value) setMemberId("");
                    }}
                    onFocus={() => {
                      if (memberId) {
                        setPkgMemSearch(localMembers.find((m) => m.id === memberId)?.full_name || "");
                      }
                    }}
                    className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2.5 text-sm min-h-[44px]"
                  />
                  {pkgMemSearch && !memberId && (() => {
                    const filtered = localMembers.filter((m) => m.full_name.toLowerCase().includes(pkgMemSearch.toLowerCase()));
                    return (
                    <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-jai-card border border-jai-border rounded-lg max-h-40 overflow-y-auto shadow-lg">
                      {filtered.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              setMemberId(m.id);
                              setPkgMemSearch("");
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-jai-blue/10 transition-colors"
                          >
                            {m.full_name}
                            {m.phone ? <span className="text-jai-text ml-1">({m.phone})</span> : ""}
                          </button>
                        ))}
                      {filtered.length === 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setNewClientName(pkgMemSearch);
                            setShowNewClient(true);
                            setPkgMemSearch("");
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-jai-blue hover:bg-jai-blue/10 transition-colors"
                        >
                          + Create &quot;{pkgMemSearch}&quot; as new client
                        </button>
                      )}
                    </div>
                    );
                  })()}
                </div>
                <div>
                  <label className="text-xs text-jai-text block mb-1">Coach</label>
                  <select
                    value={coachId}
                    onChange={(e) => setCoachId(e.target.value)}
                    required
                    className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2.5 text-sm min-h-[44px]"
                  >
                    <option value="">Select coach</option>
                    {coaches.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.full_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-jai-text block mb-1">Package Type</label>
                  <select
                    value={packageType}
                    onChange={(e) => handlePkgTypeChange(e.target.value)}
                    className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2.5 text-sm min-h-[44px]"
                  >
                    {PACKAGE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-jai-text block mb-1">Total Sessions</label>
                  <input
                    type="number"
                    value={totalSessions}
                    onChange={(e) => setTotalSessions(Number(e.target.value))}
                    min={1}
                    required
                    className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2.5 text-sm min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="text-xs text-jai-text block mb-1">Sessions Used</label>
                  <input
                    type="number"
                    value={sessionsUsed}
                    onChange={(e) => setSessionsUsed(Number(e.target.value))}
                    min={0}
                    max={totalSessions}
                    required
                    className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2.5 text-sm min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="text-xs text-jai-text block mb-1">Expiry Date</label>
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2.5 text-sm min-h-[44px]"
                  />
                </div>
              </div>
              <div className="bg-jai-bg/30 border border-jai-border rounded-lg p-3 space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-jai-text/60">
                  Guardian / Payer (optional)
                </p>
                <p className="text-[11px] text-jai-text/60 -mt-1">
                  Fill only if the payer is different from the trainee
                  (e.g. parent paying for child).
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-jai-text block mb-1">Guardian Name</label>
                    <input
                      type="text"
                      value={guardianName}
                      onChange={(e) => setGuardianName(e.target.value)}
                      placeholder="Parent / payer name"
                      className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2.5 text-sm min-h-[44px]"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-jai-text block mb-1">Guardian Phone</label>
                    <input
                      type="tel"
                      value={guardianPhone}
                      onChange={(e) => setGuardianPhone(e.target.value)}
                      placeholder="Parent / payer phone"
                      className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2.5 text-sm min-h-[44px]"
                    />
                  </div>
                </div>
              </div>
              <button
                type="submit"
                disabled={saving}
                className="w-full py-2.5 bg-jai-blue text-white text-sm rounded-lg font-medium min-h-[44px] disabled:opacity-50"
              >
                {saving
                  ? "Saving..."
                  : editingPkg
                  ? "Update Package"
                  : "Create Package"}
              </button>
            </form>
          )}

          {/* Quick schedule modal */}
          {quickSchedulePkg && (
            <form
              onSubmit={handleQuickSchedule}
              className="bg-jai-card border border-green-500/30 rounded-xl p-4 space-y-3"
            >
              <h3 className="font-semibold text-sm">
                Quick Schedule — {quickSchedulePkg.member?.full_name}
              </h3>
              <p className="text-xs text-jai-text">
                Coach: {quickSchedulePkg.coach?.full_name} ·{" "}
                {quickSchedulePkg.total_sessions - quickSchedulePkg.sessions_used} sessions
                remaining
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-jai-text block mb-1">Date</label>
                  <input
                    type="date"
                    value={quickDate}
                    onChange={(e) => setQuickDate(e.target.value)}
                    min={new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" })}
                    required
                    className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2.5 text-sm min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="text-xs text-jai-text block mb-1">Time</label>
                  <select
                    value={quickTime}
                    onChange={(e) => setQuickTime(e.target.value)}
                    required
                    className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2.5 text-sm min-h-[44px]"
                  >
                    <option value="">Select time</option>
                    {TIME_SLOTS.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 bg-green-600 text-white text-sm rounded-lg font-medium min-h-[44px] disabled:opacity-50"
                >
                  {saving ? "Scheduling..." : "Schedule"}
                </button>
                <button
                  type="button"
                  onClick={() => setQuickSchedulePkg(null)}
                  className="px-4 py-2.5 text-jai-text text-sm rounded-lg min-h-[44px]"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Merged client + package list */}
          <ClientsWithPackages
            members={members}
            ptPackages={ptPackages}
            onEditPkg={openEditPkg}
            onQuickSchedule={(pkg) => {
              setQuickSchedulePkg(pkg);
              setQuickDate("");
              setQuickTime("10:00");
            }}
          />
        </div>
      )}
    </div>
  );
}

function ClientsWithPackages({
  members,
  ptPackages,
  onEditPkg,
  onQuickSchedule,
}: {
  members: User[];
  ptPackages: PtPackage[];
  onEditPkg: (pkg: PtPackage) => void;
  onQuickSchedule: (pkg: PtPackage) => void;
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  function openEdit(m: User) {
    setEditingId(m.id);
    setEditName(m.full_name);
    setEditPhone(m.phone || "");
    setConfirmDeleteId(null);
  }

  async function handleSave(id: string) {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      await updatePtClient(id, editName.trim(), editPhone.trim());
      setEditingId(null);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      const result = await deletePtClient(id);
      if (!result.ok) {
        alert(result.error);
        return;
      }
      setEditingId(null);
      setConfirmDeleteId(null);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete client");
    } finally {
      setDeleting(false);
    }
  }

  // Build a unified list: clients with their packages
  const clientMap = new Map<string, { member: User; packages: PtPackage[] }>();

  // Add all clients from packages (they may not be in members list if inactive)
  for (const pkg of ptPackages) {
    if (pkg.member) {
      const existing = clientMap.get(pkg.user_id);
      if (existing) {
        existing.packages.push(pkg);
      } else {
        clientMap.set(pkg.user_id, { member: pkg.member as unknown as User, packages: [pkg] });
      }
    }
  }

  // Add members without packages
  for (const m of members) {
    if (!clientMap.has(m.id)) {
      clientMap.set(m.id, { member: m, packages: [] });
    }
  }

  // Sort: active packages first, then by name
  const allClients = Array.from(clientMap.values()).sort((a, b) => {
    const aActive = a.packages.some((p) => p.status === "active") ? 0 : 1;
    const bActive = b.packages.some((p) => p.status === "active") ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return (a.member.full_name || "").localeCompare(b.member.full_name || "");
  });

  const filtered = search
    ? allClients.filter(
        (c) =>
          c.member.full_name?.toLowerCase().includes(search.toLowerCase()) ||
          c.member.phone?.includes(search) ||
          c.packages.some((p) => p.coach?.full_name?.toLowerCase().includes(search.toLowerCase()))
      )
    : allClients;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-jai-text">
          {allClients.length} client{allClients.length !== 1 ? "s" : ""} · {ptPackages.length} package{ptPackages.length !== 1 ? "s" : ""}
        </p>
      </div>
      <input
        type="text"
        placeholder="Search by name, phone, or coach..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-3 py-2.5 bg-jai-bg border border-jai-border rounded-lg text-sm min-h-[44px]"
      />
      <div className="space-y-2">
        {filtered.map(({ member: m, packages: memberPkgs }) => {
          const activePkg = memberPkgs.find((p) => p.status === "active");
          const isEditing = editingId === m.id;

          return (
            <div
              key={m.id}
              className={`bg-jai-card border rounded-xl p-4 transition-colors ${
                isEditing ? "border-jai-blue/40" : "border-jai-border"
              }`}
            >
              {/* Client header */}
              <div
                className={`flex items-center justify-between ${!isEditing ? "cursor-pointer" : ""}`}
                onClick={() => !isEditing && openEdit(m)}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm flex items-center gap-1.5">
                    {m.full_name}
                    {memberPkgs.some((p) => p.guardian_name) && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-pink-500/15 text-pink-300 border border-pink-500/25 font-normal uppercase tracking-wider">
                        kid
                      </span>
                    )}
                  </p>
                  {m.phone && (
                    <a
                      href={`tel:${m.phone}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-jai-blue text-xs hover:underline"
                    >
                      {m.phone}
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-3">
                  {activePkg ? (
                    <>
                      <span
                        className={`text-sm font-medium ${
                          activePkg.total_sessions - activePkg.sessions_used <= 0
                            ? "text-red-400"
                            : activePkg.total_sessions - activePkg.sessions_used <= 2
                            ? "text-yellow-400"
                            : "text-jai-blue"
                        }`}
                      >
                        {activePkg.sessions_used}/{activePkg.total_sessions}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusBadge("active")}`}>
                        active
                      </span>
                    </>
                  ) : memberPkgs.length > 0 ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-jai-text/10 text-jai-text border border-jai-border">
                      {memberPkgs[0].status}
                    </span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-jai-text/10 text-jai-text border border-jai-border">
                      No package
                    </span>
                  )}
                </div>
              </div>

              {/* Package details (always visible if they have packages) */}
              {memberPkgs.length > 0 && !isEditing && (
                <div className="mt-2 space-y-1.5">
                  {memberPkgs.map((pkg) => {
                    const remaining = pkg.total_sessions - pkg.sessions_used;
                    return (
                      <div
                        key={pkg.id}
                        className="flex items-center justify-between text-xs text-jai-text bg-jai-bg/40 rounded-lg px-3 py-2 cursor-pointer hover:bg-jai-bg/60 transition-colors"
                        onClick={() => onEditPkg(pkg)}
                      >
                        <span>
                          Coach: {pkg.coach?.full_name || "—"} · {remaining} left
                          {pkg.expiry_date && ` · Exp: ${pkg.expiry_date}`}
                          {pkg.guardian_name && (
                            <>
                              {" · "}
                              <span className="text-jai-blue">
                                👤 {pkg.guardian_name}
                                {pkg.guardian_phone ? ` ${pkg.guardian_phone}` : ""}
                              </span>
                            </>
                          )}
                        </span>
                        {pkg.status === "active" && remaining > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onQuickSchedule(pkg);
                            }}
                            className="px-2 py-1 bg-green-600/10 text-green-400 border border-green-500/20 text-[10px] rounded-md font-medium hover:bg-green-600/20 transition-colors"
                          >
                            Schedule
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Edit client form (expanded) */}
              {isEditing && (
                <div className="mt-3 pt-3 border-t border-jai-border space-y-3" onClick={(e) => e.stopPropagation()}>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-jai-text mb-1 block">Name</label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2.5 text-sm min-h-[44px]"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-jai-text mb-1 block">Phone</label>
                      <input
                        type="tel"
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        placeholder="e.g. 91234567"
                        className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2.5 text-sm min-h-[44px]"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSave(m.id)}
                      disabled={saving || deleting}
                      className="flex-1 py-2.5 bg-jai-blue text-white text-sm rounded-lg hover:bg-jai-blue/90 disabled:opacity-50 min-h-[44px]"
                    >
                      {saving ? "Saving..." : "Save"}
                    </button>
                    <button
                      onClick={() => { setEditingId(null); setConfirmDeleteId(null); }}
                      disabled={saving || deleting}
                      className="px-4 py-2.5 bg-jai-bg border border-jai-border text-sm rounded-lg hover:bg-white/5 disabled:opacity-50 min-h-[44px]"
                    >
                      Cancel
                    </button>
                  </div>
                  {confirmDeleteId === m.id ? (
                    <div className="flex gap-2 pt-2 border-t border-jai-border">
                      <button
                        onClick={() => handleDelete(m.id)}
                        disabled={deleting}
                        className="flex-1 py-2 bg-red-500 text-white text-sm rounded-lg disabled:opacity-50 min-h-[44px] font-medium"
                      >
                        {deleting ? "Deleting..." : `Yes, delete ${m.full_name}`}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        disabled={deleting}
                        className="px-4 py-2 bg-jai-bg border border-jai-border text-sm rounded-lg disabled:opacity-50 min-h-[44px]"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(m.id)}
                      disabled={saving || deleting}
                      className="w-full py-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-xs font-medium hover:bg-red-500/15 disabled:opacity-50 min-h-[44px]"
                    >
                      Delete client
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="bg-jai-card border border-jai-border rounded-xl p-4 text-jai-text text-center text-sm">
            {search ? "No clients match your search" : "No clients found"}
          </div>
        )}
      </div>
    </div>
  );
}
