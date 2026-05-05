"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { User, PtPackage, PtSession } from "@/lib/types/database";

function statusBadge(status: string) {
  switch (status) {
    case "completed":
      return "bg-green-500/15 text-green-300 border border-green-500/25";
    case "scheduled":
    case "confirmed":
      return "bg-blue-500/15 text-blue-300 border border-blue-500/25";
    case "cancelled":
      return "bg-jai-text/10 text-jai-text border border-jai-border";
    case "no_show":
      return "bg-red-500/15 text-red-300 border border-red-500/25";
    default:
      return "bg-jai-text/10 text-jai-text border border-jai-border";
  }
}

function statusLabel(status: string) {
  if (status === "no_show") return "No-show";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatSgtDateTime(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Singapore",
    }),
    time: d.toLocaleTimeString("en-SG", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Singapore",
    }),
    isoDate: d.toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" }),
    monthKey: d.toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" }).slice(0, 7),
  };
}

type StatusFilter = "all" | "completed" | "no_show" | "cancelled" | "scheduled";

export function PtClientHistory({
  member,
  packages,
  sessions,
  isAdmin,
}: {
  member: User;
  packages: PtPackage[];
  sessions: PtSession[];
  isAdmin: boolean;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [monthFilter, setMonthFilter] = useState<string>("");

  // Summary counts (over ALL sessions, not filtered).
  const counts = useMemo(() => {
    const c = { completed: 0, scheduled: 0, cancelled: 0, no_show: 0, total: sessions.length };
    for (const s of sessions) {
      if (s.status === "completed") c.completed++;
      else if (s.status === "scheduled" || s.status === "confirmed") c.scheduled++;
      else if (s.status === "cancelled") c.cancelled++;
      else if (s.status === "no_show") c.no_show++;
    }
    return c;
  }, [sessions]);

  // Available months for filter.
  const months = useMemo(() => {
    const set = new Set<string>();
    for (const s of sessions) {
      const d = new Date(s.scheduled_at);
      set.add(d.toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" }).slice(0, 7));
    }
    return Array.from(set).sort().reverse();
  }, [sessions]);

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      if (statusFilter !== "all") {
        if (statusFilter === "scheduled") {
          if (s.status !== "scheduled" && s.status !== "confirmed") return false;
        } else if (s.status !== statusFilter) return false;
      }
      if (monthFilter) {
        const m = new Date(s.scheduled_at)
          .toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" })
          .slice(0, 7);
        if (m !== monthFilter) return false;
      }
      return true;
    });
  }, [sessions, statusFilter, monthFilter]);

  const activePkg = packages.find((p) => p.status === "active");

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <Link
          href="/pt"
          className="text-jai-text text-sm hover:text-white inline-flex items-center gap-1"
        >
          ← PT Management
        </Link>
      </div>

      {/* Member header */}
      <div className="bg-jai-card border border-jai-border rounded-2xl p-5 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">{member.full_name}</h1>
            {member.phone && (
              <a
                href={`tel:${member.phone}`}
                className="text-jai-blue text-sm hover:underline"
              >
                {member.phone}
              </a>
            )}
          </div>
          {activePkg && (
            <div className="text-right">
              <p className="text-xs text-jai-text uppercase tracking-wider">Active package</p>
              <p className="text-lg font-semibold">
                {activePkg.sessions_used}/{activePkg.total_sessions}
              </p>
              <p className="text-xs text-jai-text">
                {activePkg.total_sessions - activePkg.sessions_used} left
                {activePkg.expiry_date ? ` · exp ${activePkg.expiry_date}` : ""}
              </p>
            </div>
          )}
        </div>

        {/* Counts grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 pt-2 border-t border-jai-border">
          <Stat label="Total" value={counts.total} />
          <Stat label="Completed" value={counts.completed} tone="green" />
          <Stat label="Upcoming" value={counts.scheduled} tone="blue" />
          <Stat label="No-show" value={counts.no_show} tone="red" />
          <Stat label="Cancelled" value={counts.cancelled} tone="muted" />
        </div>
      </div>

      {/* Packages */}
      {packages.length > 0 && (
        <div className="bg-jai-card border border-jai-border rounded-2xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-jai-text uppercase tracking-wider">
            Packages
          </h2>
          <div className="space-y-2">
            {packages.map((pkg) => {
              const remaining = pkg.total_sessions - pkg.sessions_used;
              return (
                <div
                  key={pkg.id}
                  className="flex items-center justify-between text-sm bg-jai-bg/40 rounded-lg px-3 py-2 flex-wrap gap-2"
                >
                  <div className="min-w-0">
                    <span className="font-medium">
                      {pkg.sessions_used}/{pkg.total_sessions}
                    </span>
                    <span className="text-jai-text">
                      {" "}· {pkg.coach?.full_name || "—"}
                      {pkg.expiry_date ? ` · exp ${pkg.expiry_date}` : ""}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full ${
                      pkg.status === "active"
                        ? "bg-green-500/10 text-green-400 border border-green-500/20"
                        : pkg.status === "expired"
                          ? "bg-red-500/10 text-red-300 border border-red-500/20"
                          : "bg-jai-text/10 text-jai-text border border-jai-border"
                    }`}
                  >
                    {pkg.status} · {remaining} left
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-jai-card border border-jai-border rounded-2xl p-4 space-y-3">
        <h2 className="text-sm font-semibold text-jai-text uppercase tracking-wider">
          Session History
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          <FilterChip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
            All
          </FilterChip>
          <FilterChip
            active={statusFilter === "completed"}
            onClick={() => setStatusFilter("completed")}
          >
            Completed
          </FilterChip>
          <FilterChip
            active={statusFilter === "scheduled"}
            onClick={() => setStatusFilter("scheduled")}
          >
            Upcoming
          </FilterChip>
          <FilterChip
            active={statusFilter === "no_show"}
            onClick={() => setStatusFilter("no_show")}
          >
            No-show
          </FilterChip>
          <FilterChip
            active={statusFilter === "cancelled"}
            onClick={() => setStatusFilter("cancelled")}
          >
            Cancelled
          </FilterChip>
          {months.length > 0 && (
            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="ml-auto px-3 py-1.5 bg-jai-bg border border-jai-border text-jai-text text-xs rounded-lg"
            >
              <option value="">All months</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {new Date(`${m}-01`).toLocaleDateString("en-GB", {
                    month: "long",
                    year: "numeric",
                  })}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Session list */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="bg-jai-card border border-jai-border rounded-xl p-6 text-center text-jai-text text-sm">
            No sessions match these filters.
          </div>
        ) : (
          filtered.map((s) => {
            const f = formatSgtDateTime(s.scheduled_at);
            const expanded = expandedId === s.id;
            return (
              <div
                key={s.id}
                className="bg-jai-card border border-jai-border rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => setExpandedId(expanded ? null : s.id)}
                  className="w-full text-left p-4 hover:bg-jai-bg/30 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-medium text-sm">
                        {f.date} · {f.time}
                      </p>
                      <p className="text-xs text-jai-text mt-0.5">
                        Coach: {s.coach?.full_name || "—"}
                        {s.session_type ? ` · ${s.session_type}` : ""}
                        {s.duration_minutes ? ` · ${s.duration_minutes} min` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusBadge(s.status)}`}>
                        {statusLabel(s.status)}
                      </span>
                      <span className="text-jai-text text-xs">{expanded ? "▴" : "▾"}</span>
                    </div>
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-jai-border bg-jai-bg/20 px-4 py-3 text-xs text-jai-text space-y-1">
                    <Row k="Status" v={statusLabel(s.status)} />
                    <Row k="Date" v={`${f.date} ${f.time}`} />
                    <Row k="Coach" v={s.coach?.full_name || "—"} />
                    {s.session_type && <Row k="Type" v={s.session_type} />}
                    <Row k="Duration" v={`${s.duration_minutes || 60} min`} />
                    {s.paid_amount != null && <Row k="Paid" v={`$${s.paid_amount}`} />}
                    {isAdmin && s.package_id && (
                      <Row k="Package" v={s.package_id.slice(0, 8)} />
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "green" | "blue" | "red" | "muted";
}) {
  const colour =
    tone === "green"
      ? "text-green-300"
      : tone === "blue"
        ? "text-blue-300"
        : tone === "red"
          ? "text-red-300"
          : tone === "muted"
            ? "text-jai-text"
            : "text-white";
  return (
    <div className="rounded-lg bg-jai-bg/40 px-3 py-2">
      <p className="text-[10px] text-jai-text uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-semibold ${colour}`}>{value}</p>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
        active
          ? "bg-jai-blue text-white border-jai-blue"
          : "bg-jai-bg border-jai-border text-jai-text hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-jai-text">{k}</span>
      <span className="text-white font-medium">{v}</span>
    </div>
  );
}
