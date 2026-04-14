"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Lead, LeadStatus } from "@/app/actions/leads";
import { updateLeadStatus, updateLeadNotes } from "@/app/actions/leads";

const STATUS_CONFIG: Record<LeadStatus, { label: string; color: string; bg: string; border: string }> = {
  new: { label: "New", color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" },
  contacted: { label: "Contacted", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
  converted: { label: "Converted", color: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/20" },
  lost: { label: "Lost", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20" },
};

const STATUSES: LeadStatus[] = ["new", "contacted", "converted", "lost"];

function formatPhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-()]/g, "");
  if (cleaned.startsWith("+65")) return cleaned;
  if (cleaned.startsWith("65") && cleaned.length === 10) return `+${cleaned}`;
  if (/^[689]\d{7}$/.test(cleaned)) return `+65${cleaned}`;
  if (!cleaned.startsWith("+")) return `+${cleaned}`;
  return cleaned;
}

function waLink(phone: string): string {
  const digits = formatPhone(phone).replace(/\+/g, "");
  return `https://wa.me/${digits}`;
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Singapore" });
}

function LeadCard({
  lead,
  onStatusChange,
}: {
  lead: Lead;
  onStatusChange: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState(lead.notes || "");
  const [showNotes, setShowNotes] = useState(false);

  const cfg = STATUS_CONFIG[lead.status];

  const handleStatus = async (status: LeadStatus) => {
    setSaving(true);
    try {
      await updateLeadStatus(lead.id, status);
      onStatusChange();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotes = async () => {
    setSaving(true);
    try {
      await updateLeadNotes(lead.id, notes);
      setShowNotes(false);
      onStatusChange();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-jai-card border border-jai-border rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-medium text-sm truncate">{lead.name}</p>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color} ${cfg.border} border`}>
              {cfg.label}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-jai-text">
            {lead.source && (
              <span className="capitalize">{lead.source}</span>
            )}
            <span>{timeAgo(lead.created_at)}</span>
          </div>
          {lead.interest && (
            <p className="text-xs text-jai-text/70 mt-1">Interest: {lead.interest}</p>
          )}
        </div>

        {/* WhatsApp button */}
        {lead.phone && (
          <a
            href={waLink(lead.phone)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
          </a>
        )}

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-shrink-0 text-jai-text hover:text-white p-1"
        >
          <svg
            className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-jai-border space-y-3">
          {/* Contact details */}
          <div className="space-y-1">
            {lead.phone && (
              <p className="text-xs text-jai-text">
                Phone: <a href={`tel:${lead.phone}`} className="text-jai-blue">{lead.phone}</a>
              </p>
            )}
            {lead.email && (
              <p className="text-xs text-jai-text">
                Email: <a href={`mailto:${lead.email}`} className="text-jai-blue">{lead.email}</a>
              </p>
            )}
          </div>

          {/* Status buttons */}
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => {
              const c = STATUS_CONFIG[s];
              const active = lead.status === s;
              return (
                <button
                  key={s}
                  onClick={() => handleStatus(s)}
                  disabled={saving || active}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors min-h-[36px] ${
                    active
                      ? `${c.bg} ${c.color} ${c.border} opacity-100`
                      : `bg-jai-bg text-jai-text border-jai-border hover:${c.bg} hover:${c.color}`
                  } disabled:opacity-50`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>

          {/* Notes */}
          {lead.notes && !showNotes && (
            <div className="bg-jai-bg/40 rounded-lg p-2.5 border border-jai-border">
              <p className="text-xs text-jai-text">{lead.notes}</p>
            </div>
          )}

          <div className="flex gap-2">
            {showNotes ? (
              <div className="flex-1 space-y-2">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2 text-sm resize-none"
                  placeholder="Add notes..."
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveNotes}
                    disabled={saving}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-jai-blue/20 text-jai-blue border border-jai-blue/30 disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={() => { setShowNotes(false); setNotes(lead.notes || ""); }}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg text-jai-text border border-jai-border"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowNotes(true)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg text-jai-text border border-jai-border hover:text-white transition-colors"
              >
                {lead.notes ? "Edit Notes" : "Add Notes"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function LeadsPageClient({ leads }: { leads: Lead[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<LeadStatus | "all">("all");
  const [search, setSearch] = useState("");

  const filtered = leads.filter((l) => {
    if (filter !== "all" && l.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        l.name.toLowerCase().includes(q) ||
        (l.phone && l.phone.includes(q)) ||
        (l.email && l.email.toLowerCase().includes(q)) ||
        (l.interest && l.interest.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const counts = {
    all: leads.length,
    new: leads.filter((l) => l.status === "new").length,
    contacted: leads.filter((l) => l.status === "contacted").length,
    converted: leads.filter((l) => l.status === "converted").length,
    lost: leads.filter((l) => l.status === "lost").length,
  };

  return (
    <div className="p-4 pb-24 max-w-lg mx-auto space-y-4">
      <h1 className="text-xl font-bold">Leads</h1>

      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-2.5 text-center">
          <p className="text-lg font-bold text-blue-400">{counts.new}</p>
          <p className="text-[10px] text-blue-400/70">New</p>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 text-center">
          <p className="text-lg font-bold text-amber-400">{counts.contacted}</p>
          <p className="text-[10px] text-amber-400/70">Contacted</p>
        </div>
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-2.5 text-center">
          <p className="text-lg font-bold text-green-400">{counts.converted}</p>
          <p className="text-[10px] text-green-400/70">Converted</p>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2.5 text-center">
          <p className="text-lg font-bold text-red-400">{counts.lost}</p>
          <p className="text-[10px] text-red-400/70">Lost</p>
        </div>
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search leads..."
        className="w-full bg-jai-card border border-jai-border rounded-lg px-3 py-2.5 text-sm min-h-[44px]"
      />

      {/* Filter tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {(["all", ...STATUSES] as const).map((s) => {
          const active = filter === s;
          const label = s === "all" ? "All" : STATUS_CONFIG[s].label;
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                active
                  ? "bg-jai-blue/20 text-jai-blue border border-jai-blue/30"
                  : "text-jai-text border border-jai-border hover:text-white"
              }`}
            >
              {label} ({counts[s]})
            </button>
          );
        })}
      </div>

      {/* Lead list */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-jai-text text-sm">
            {leads.length === 0
              ? "No leads yet. Connect your Meta lead forms to start receiving leads here."
              : "No leads match your filter."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onStatusChange={() => router.refresh()}
            />
          ))}
        </div>
      )}
    </div>
  );
}
