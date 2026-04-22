"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Lead, LeadStatus } from "@/app/actions/leads";
import { updateLeadStatus, updateLeadNotes } from "@/app/actions/leads";
import { PullToRefresh } from "./pull-to-refresh";
import { createClient } from "@/lib/supabase/client";

const STATUS_CONFIG: Record<LeadStatus, { label: string; color: string; bg: string; border: string; strip: string }> = {
  new: { label: "New", color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20", strip: "bg-blue-400" },
  contacted: { label: "Contacted", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", strip: "bg-amber-400" },
  converted: { label: "Converted", color: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/20", strip: "bg-green-400" },
  lost: { label: "Lost", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20", strip: "bg-red-400" },
};

const STATUSES: LeadStatus[] = ["new", "contacted", "converted", "lost"];

type Preset = { id: string; label: string; match: (l: Lead) => boolean };

const PRESETS: Preset[] = [
  { id: "all", label: "All", match: () => true },
  { id: "new-ig-7d", label: "New IG · 7d", match: (l) => l.status === "new" && l.source === "instagram" && isWithinDays(l.created_at, 7) },
  { id: "new-fb-7d", label: "New FB · 7d", match: (l) => l.status === "new" && l.source === "facebook" && isWithinDays(l.created_at, 7) },
  { id: "contacted-no-follow-3d", label: "Contacted · stale 3d", match: (l) => l.status === "contacted" && daysSince(l.updated_at || l.created_at) >= 3 },
  { id: "converted-this-month", label: "Converted · this month", match: (l) => l.status === "converted" && isSameMonthSGT(l.updated_at || l.created_at) },
];

function daysSince(dateStr: string): number {
  return (Date.now() - new Date(dateStr).getTime()) / 86400000;
}
function isWithinDays(dateStr: string, days: number): boolean {
  return daysSince(dateStr) <= days;
}
function isSameMonthSGT(dateStr: string): boolean {
  const now = new Date();
  const d = new Date(dateStr);
  const fmt = (x: Date) => x.toLocaleString("en-GB", { timeZone: "Asia/Singapore", month: "2-digit", year: "numeric" });
  return fmt(now) === fmt(d);
}

function formatPhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-()]/g, "");
  if (cleaned.startsWith("+65")) return cleaned;
  if (cleaned.startsWith("65") && cleaned.length === 10) return `+${cleaned}`;
  if (/^[689]\d{7}$/.test(cleaned)) return `+65${cleaned}`;
  if (!cleaned.startsWith("+")) return `+${cleaned}`;
  return cleaned;
}

function waLink(phone: string, name?: string): string {
  const digits = formatPhone(phone).replace(/\+/g, "");
  const first = (name || "").trim().split(/\s+/)[0] || "there";
  const sgHour = (new Date().getUTCHours() + 8) % 24;
  const greeting = sgHour < 12 ? "Good morning" : sgHour < 18 ? "Good afternoon" : "Good evening";
  const msg = `${greeting} ${first}! Thanks for getting in touch via our Facebook/Instagram!\n\nWe'd love to help you get started in learning the art of Muay Thai.\n\nWould you like to schedule a session for yourself?\n\nThank you :)\n\nJeremy Jude\nJai Muay Thai\n\nFind out more about our sessions here too: https://jaimuaythai.com/adults/`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`;
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

function WhatsAppIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function LeadCard({
  lead,
  selected,
  focused,
  selectMode,
  isNew,
  onToggleSelect,
  onStatusChange,
  onFocus,
  cardRef,
}: {
  lead: Lead;
  selected: boolean;
  focused: boolean;
  selectMode: boolean;
  isNew: boolean;
  onToggleSelect: () => void;
  onStatusChange: () => void;
  onFocus: () => void;
  cardRef?: (el: HTMLDivElement | null) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState(lead.notes || "");
  const [editingNotes, setEditingNotes] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  const cfg = STATUS_CONFIG[lead.status];

  useEffect(() => {
    setNotes(lead.notes || "");
  }, [lead.notes]);

  const handleStatus = async (status: LeadStatus) => {
    setStatusOpen(false);
    if (status === lead.status) return;
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
      setEditingNotes(false);
      onStatusChange();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      ref={cardRef}
      onClick={onFocus}
      className={`relative bg-jai-card border rounded-xl p-4 pl-5 transition-all overflow-hidden ${
        isNew ? "border-green-500/50 ring-1 ring-green-500/30 animate-pulse-once" :
        focused ? "border-jai-blue/40 ring-1 ring-jai-blue/30" : "border-jai-border"
      } ${selected ? "ring-1 ring-jai-blue/60" : ""}`}
    >
      {/* Status strip */}
      <span className={`absolute left-0 top-0 bottom-0 w-1 ${cfg.strip}`} aria-hidden />

      {/* Live "just arrived" badge */}
      {isNew && (
        <span className="absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30 uppercase tracking-wide">
          Just in
        </span>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          {/* Checkbox (admin multi-select) */}
          {selectMode && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
              className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border transition-colors ${
                selected ? "bg-jai-blue border-jai-blue text-white" : "border-jai-border"
              }`}
              aria-label={selected ? "Deselect" : "Select"}
            >
              {selected && (
                <svg className="w-3 h-3 mx-auto" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <p className="font-medium text-sm truncate">{lead.name}</p>

              {/* Inline status pill (click to change) */}
              <div className="relative">
                <button
                  onClick={(e) => { e.stopPropagation(); setStatusOpen((v) => !v); }}
                  disabled={saving}
                  className={`text-[10px] px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color} ${cfg.border} border inline-flex items-center gap-1 hover:opacity-80`}
                  aria-label="Change status"
                >
                  {cfg.label}
                  <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M5.3 7.3a1 1 0 011.4 0L10 10.6l3.3-3.3a1 1 0 011.4 1.4l-4 4a1 1 0 01-1.4 0l-4-4a1 1 0 010-1.4z" />
                  </svg>
                </button>
                {statusOpen && (
                  <div className="absolute top-full left-0 mt-1 z-20 bg-jai-card border border-jai-border rounded-lg shadow-lg p-1 flex flex-col min-w-[110px]">
                    {STATUSES.map((s) => {
                      const c = STATUS_CONFIG[s];
                      const active = lead.status === s;
                      return (
                        <button
                          key={s}
                          onClick={(e) => { e.stopPropagation(); handleStatus(s); }}
                          className={`text-left text-[11px] px-2 py-1.5 rounded ${active ? `${c.bg} ${c.color}` : "hover:bg-jai-bg text-jai-text"}`}
                        >
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs text-jai-text flex-wrap">
              {lead.source && <span className="capitalize">{lead.source}</span>}
              <span>{timeAgo(lead.created_at)}</span>
            </div>

            {/* Inline contact + interest */}
            <div className="mt-1.5 space-y-0.5">
              {lead.phone && (
                <p className="text-xs">
                  <a
                    href={`tel:${lead.phone}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-jai-blue hover:underline"
                  >
                    {lead.phone}
                  </a>
                </p>
              )}
              {lead.email && (
                <p className="text-xs truncate">
                  <a
                    href={`mailto:${lead.email}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-jai-blue hover:underline"
                  >
                    {lead.email}
                  </a>
                </p>
              )}
              {lead.interest && (
                <p className="text-xs text-jai-text/70">Interest: {lead.interest}</p>
              )}
            </div>
          </div>
        </div>

        {/* WhatsApp button */}
        {lead.phone && (
          <a
            href={waLink(lead.phone, lead.name)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 transition-colors"
            aria-label={`WhatsApp ${lead.name}`}
          >
            <WhatsAppIcon />
          </a>
        )}
      </div>

      {/* Notes — inline edit */}
      <div className="mt-3 pt-3 border-t border-jai-border/60">
        {editingNotes ? (
          <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
            <textarea
              autoFocus
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
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => { setEditingNotes(false); setNotes(lead.notes || ""); }}
                className="px-3 py-1.5 text-xs font-medium rounded-lg text-jai-text border border-jai-border"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); setEditingNotes(true); }}
            className="w-full text-left text-xs text-jai-text/70 hover:text-jai-text transition-colors"
          >
            {lead.notes ? lead.notes : <span className="italic">Add notes…</span>}
          </button>
        )}
      </div>
    </div>
  );
}

function loadSavedPreset(): string {
  if (typeof window === "undefined") return "all";
  return localStorage.getItem("jmt-leads-preset") || "all";
}
function saveSavedPreset(id: string) {
  if (typeof window !== "undefined") localStorage.setItem("jmt-leads-preset", id);
}

export function LeadsPageClient({ leads: initialLeads, isAdmin = false }: { leads: Lead[]; isAdmin?: boolean }) {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [newLeadIds, setNewLeadIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<LeadStatus | "all">("all");
  const [presetId, setPresetId] = useState<string>("all");

  // Live subscription — prepend new leads as they arrive via Meta webhook
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("leads-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "leads" },
        (payload) => {
          const newLead = payload.new as Lead;
          setLeads((prev) => {
            if (prev.some((l) => l.id === newLead.id)) return prev;
            return [newLead, ...prev];
          });
          setNewLeadIds((prev) => new Set(prev).add(newLead.id));
          // Clear the "new" flash after 10s
          setTimeout(() => {
            setNewLeadIds((prev) => {
              const next = new Set(prev);
              next.delete(newLead.id);
              return next;
            });
          }, 10000);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);
  const [search, setSearch] = useState("");
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Hydrate saved preset client-side
  useEffect(() => {
    setPresetId(loadSavedPreset());
  }, []);
  useEffect(() => {
    saveSavedPreset(presetId);
  }, [presetId]);

  const activePreset = PRESETS.find((p) => p.id === presetId) || PRESETS[0];

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      if (!activePreset.match(l)) return false;
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
  }, [leads, filter, search, activePreset]);

  const counts = useMemo(() => ({
    all: leads.length,
    new: leads.filter((l) => l.status === "new").length,
    contacted: leads.filter((l) => l.status === "contacted").length,
    converted: leads.filter((l) => l.status === "converted").length,
    lost: leads.filter((l) => l.status === "lost").length,
  }), [leads]);

  // Keep focused idx in range
  useEffect(() => {
    if (focusedIdx >= filtered.length) setFocusedIdx(Math.max(0, filtered.length - 1));
  }, [filtered.length, focusedIdx]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      // ? help works even in inputs
      if (e.key === "?" && !typing) {
        e.preventDefault();
        setShowHelp((v) => !v);
        return;
      }
      if (e.key === "Escape") {
        setShowHelp(false);
        setSelectMode(false);
        setSelected(new Set());
        return;
      }

      if (typing) {
        // / focuses search from anywhere; otherwise don't intercept while typing
        if (e.key === "Escape") (target as HTMLInputElement).blur();
        return;
      }

      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIdx((i) => Math.min(filtered.length - 1, i + 1));
        return;
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIdx((i) => Math.max(0, i - 1));
        return;
      }
      const current = filtered[focusedIdx];
      if (!current) return;

      if (e.key === "c") {
        e.preventDefault();
        updateLeadStatus(current.id, "contacted").then(() => router.refresh());
        return;
      }
      if (e.key === "x") {
        e.preventDefault();
        updateLeadStatus(current.id, "lost").then(() => router.refresh());
        return;
      }
      if (e.key === "v") {
        e.preventDefault();
        updateLeadStatus(current.id, "converted").then(() => router.refresh());
        return;
      }
      if (e.key === "w" && current.phone) {
        e.preventDefault();
        window.open(waLink(current.phone, current.name), "_blank", "noopener");
        return;
      }
      if (e.key === "e" && current.email) {
        e.preventDefault();
        window.location.href = `mailto:${current.email}`;
        return;
      }
      if (e.key === " ") {
        // space toggles selection in select mode
        if (selectMode) {
          e.preventDefault();
          setSelected((s) => {
            const next = new Set(s);
            if (next.has(current.id)) next.delete(current.id);
            else next.add(current.id);
            return next;
          });
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, focusedIdx, router, selectMode]);

  // Scroll focused card into view
  useEffect(() => {
    const current = filtered[focusedIdx];
    if (!current) return;
    const el = cardRefs.current.get(current.id);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusedIdx, filtered]);

  const toggleSelected = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedIds = Array.from(selected);

  const handleBulkStatus = async (status: LeadStatus) => {
    if (selectedIds.length === 0) return;
    setBulkBusy(true);
    try {
      await Promise.allSettled(selectedIds.map((id) => updateLeadStatus(id, status)));
      setSelected(new Set());
      setSelectMode(false);
      router.refresh();
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <PullToRefresh>
    <div className="p-4 pb-28 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Leads</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHelp(true)}
            className="hidden md:inline-flex text-xs text-jai-text hover:text-white px-2 py-1 border border-jai-border rounded-lg"
            aria-label="Keyboard shortcuts"
          >
            ? shortcuts
          </button>
          {isAdmin && (
            <button
              onClick={() => {
                setSelectMode((v) => !v);
                setSelected(new Set());
              }}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                selectMode
                  ? "bg-jai-blue/20 text-jai-blue border-jai-blue/30"
                  : "text-jai-text border-jai-border hover:text-white"
              }`}
            >
              {selectMode ? "Done" : "Select"}
            </button>
          )}
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-2">
        {(["new", "contacted", "converted", "lost"] as LeadStatus[]).map((s) => {
          const c = STATUS_CONFIG[s];
          return (
            <button
              key={s}
              onClick={() => setFilter((cur) => (cur === s ? "all" : s))}
              className={`${c.bg} border ${c.border} rounded-lg p-2.5 text-center transition-all ${filter === s ? "ring-1 ring-jai-blue/50" : "hover:opacity-80"}`}
            >
              <p className={`text-lg font-bold ${c.color}`}>{counts[s]}</p>
              <p className={`text-[10px] ${c.color}/70`}>{c.label}</p>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <input
        ref={searchRef}
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search leads…  (press / to focus)"
        className="w-full bg-jai-card border border-jai-border rounded-lg px-3 py-2.5 text-sm min-h-[44px]"
      />

      {/* Filter tabs (status) */}
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

      {/* Saved views / presets */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {PRESETS.map((p) => {
          const active = presetId === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setPresetId(p.id)}
              className={`px-3 py-1.5 text-[11px] font-medium rounded-lg whitespace-nowrap transition-colors ${
                active
                  ? "bg-white/10 text-white border border-white/20"
                  : "text-jai-text/70 border border-jai-border hover:text-white"
              }`}
            >
              {p.label}
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((lead, idx) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              selected={selected.has(lead.id)}
              focused={idx === focusedIdx}
              selectMode={selectMode}
              isNew={newLeadIds.has(lead.id)}
              onToggleSelect={() => toggleSelected(lead.id)}
              onFocus={() => setFocusedIdx(idx)}
              onStatusChange={() => router.refresh()}
              cardRef={(el) => {
                if (el) cardRefs.current.set(lead.id, el);
                else cardRefs.current.delete(lead.id);
              }}
            />
          ))}
        </div>
      )}

      {/* Bulk action bar */}
      {selectMode && selected.size > 0 && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-30 bg-jai-card border border-jai-border rounded-full shadow-lg px-4 py-2 flex items-center gap-3">
          <span className="text-xs text-jai-text">{selected.size} selected</span>
          <div className="w-px h-4 bg-jai-border" />
          <button
            disabled={bulkBusy}
            onClick={() => handleBulkStatus("contacted")}
            className="text-xs text-amber-400 hover:text-amber-300 disabled:opacity-50"
          >
            Contacted
          </button>
          <button
            disabled={bulkBusy}
            onClick={() => handleBulkStatus("converted")}
            className="text-xs text-green-400 hover:text-green-300 disabled:opacity-50"
          >
            Converted
          </button>
          <button
            disabled={bulkBusy}
            onClick={() => handleBulkStatus("lost")}
            className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
          >
            Lost
          </button>
          <button
            onClick={() => { setSelected(new Set()); }}
            className="text-xs text-jai-text hover:text-white"
          >
            Clear
          </button>
        </div>
      )}

      {/* Keyboard help overlay */}
      {showHelp && (
        <div
          onClick={() => setShowHelp(false)}
          className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-jai-card border border-jai-border rounded-xl p-5 max-w-sm w-full space-y-2"
          >
            <h3 className="font-semibold">Keyboard shortcuts</h3>
            <ul className="text-sm text-jai-text space-y-1.5">
              <li><kbd className="bg-jai-bg border border-jai-border px-1.5 rounded">j</kbd> / <kbd className="bg-jai-bg border border-jai-border px-1.5 rounded">k</kbd> — move focus</li>
              <li><kbd className="bg-jai-bg border border-jai-border px-1.5 rounded">c</kbd> — mark Contacted</li>
              <li><kbd className="bg-jai-bg border border-jai-border px-1.5 rounded">v</kbd> — mark conVerted</li>
              <li><kbd className="bg-jai-bg border border-jai-border px-1.5 rounded">x</kbd> — mark lost (X)</li>
              <li><kbd className="bg-jai-bg border border-jai-border px-1.5 rounded">w</kbd> — open WhatsApp</li>
              <li><kbd className="bg-jai-bg border border-jai-border px-1.5 rounded">e</kbd> — email</li>
              <li><kbd className="bg-jai-bg border border-jai-border px-1.5 rounded">/</kbd> — focus search</li>
              <li><kbd className="bg-jai-bg border border-jai-border px-1.5 rounded">?</kbd> — toggle this help</li>
              <li><kbd className="bg-jai-bg border border-jai-border px-1.5 rounded">Esc</kbd> — dismiss</li>
            </ul>
            <p className="text-xs text-jai-text/60 pt-1">Works on desktop. Mobile = taps.</p>
          </div>
        </div>
      )}
    </div>
    </PullToRefresh>
  );
}
