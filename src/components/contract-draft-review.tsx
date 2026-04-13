"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ContractDraft } from "@/app/actions/pt";
import { saveContractDraft, discardContractDraft } from "@/app/actions/pt";

type Coach = { id: string; full_name: string | null };

export function ContractDraftBanner({
  drafts,
  onReview,
}: {
  drafts: ContractDraft[];
  onReview: (draft: ContractDraft) => void;
}) {
  if (drafts.length === 0) return null;

  return (
    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 space-y-2">
      <p className="text-sm font-medium text-amber-400">
        📋 {drafts.length} contract{drafts.length > 1 ? "s" : ""} pending review
      </p>
      <div className="space-y-2">
        {drafts.map((d) => (
          <div
            key={d.id}
            className="flex items-center justify-between bg-jai-card border border-jai-border rounded-lg px-3 py-2"
          >
            <div>
              <p className="text-sm font-medium">{d.client_name || "Unknown Client"}</p>
              <p className="text-xs text-jai-text">
                {d.total_sessions || "?"} sessions · {d.coach_name || "No coach"} ·{" "}
                {new Date(d.created_at).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Asia/Singapore",
                })}
              </p>
            </div>
            <button
              onClick={() => onReview(d)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition-colors"
            >
              Review
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ContractDraftReviewForm({
  draft,
  coaches,
  onClose,
}: {
  draft: ContractDraft;
  coaches: Coach[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [clientName, setClientName] = useState(draft.client_name || "");
  const [clientPhone, setClientPhone] = useState(draft.client_phone || "");
  const [coachId, setCoachId] = useState(draft.coach_id || "");
  const [totalSessions, setTotalSessions] = useState(draft.total_sessions || 10);
  const [sessionsUsed, setSessionsUsed] = useState(draft.sessions_used || 0);
  const [totalPrice, setTotalPrice] = useState(draft.total_price || 0);
  const [expiryDate, setExpiryDate] = useState(draft.expiry_date || "");
  const [saving, setSaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  const handleSave = async () => {
    if (!clientName.trim()) {
      alert("Client name is required");
      return;
    }
    if (!coachId) {
      alert("Please select a coach");
      return;
    }
    setSaving(true);
    try {
      await saveContractDraft(draft.id, {
        client_name: clientName.trim(),
        client_phone: clientPhone.trim(),
        coach_id: coachId,
        total_sessions: totalSessions,
        sessions_used: sessionsUsed,
        total_price: totalPrice || null,
        expiry_date: expiryDate || null,
      });
      router.refresh();
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = async () => {
    if (!confirm("Discard this contract draft?")) return;
    setDiscarding(true);
    try {
      await discardContractDraft(draft.id);
      router.refresh();
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to discard");
    } finally {
      setDiscarding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg bg-jai-card border border-jai-border rounded-xl p-5 space-y-4 max-h-[90vh] overflow-y-auto animate-slide-up">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Review Contract</h3>
          <button
            onClick={onClose}
            className="text-jai-text hover:text-white text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <p className="text-xs text-jai-text/60">
          AI-extracted from contract photo. Verify and edit before saving.
        </p>

        <div className="space-y-3">
          {/* Client Name */}
          <div>
            <label className="text-xs text-jai-text/70 block mb-1">Client Name *</label>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2.5 text-sm min-h-[44px]"
              placeholder="Full name"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="text-xs text-jai-text/70 block mb-1">Phone</label>
            <input
              type="tel"
              value={clientPhone}
              onChange={(e) => setClientPhone(e.target.value)}
              className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2.5 text-sm min-h-[44px]"
              placeholder="e.g. 91234567"
            />
          </div>

          {/* Coach */}
          <div>
            <label className="text-xs text-jai-text/70 block mb-1">Coach *</label>
            <select
              value={coachId}
              onChange={(e) => setCoachId(e.target.value)}
              className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2.5 text-sm min-h-[44px]"
            >
              <option value="">Select coach</option>
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </select>
            {draft.coach_name && !coachId && (
              <p className="text-xs text-amber-400 mt-1">
                AI detected: &quot;{draft.coach_name}&quot; — please select the matching coach above
              </p>
            )}
          </div>

          {/* Sessions */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-jai-text/70 block mb-1">Total Sessions</label>
              <input
                type="number"
                value={totalSessions}
                onChange={(e) => setTotalSessions(Number(e.target.value))}
                min={1}
                className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2.5 text-sm min-h-[44px]"
              />
            </div>
            <div>
              <label className="text-xs text-jai-text/70 block mb-1">Sessions Used</label>
              <input
                type="number"
                value={sessionsUsed}
                onChange={(e) => setSessionsUsed(Number(e.target.value))}
                min={0}
                max={totalSessions}
                className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2.5 text-sm min-h-[44px]"
              />
            </div>
          </div>

          {/* Price */}
          <div>
            <label className="text-xs text-jai-text/70 block mb-1">Total Price (SGD)</label>
            <input
              type="number"
              value={totalPrice || ""}
              onChange={(e) => setTotalPrice(Number(e.target.value))}
              className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2.5 text-sm min-h-[44px]"
              placeholder="e.g. 1600"
            />
          </div>

          {/* Expiry */}
          <div>
            <label className="text-xs text-jai-text/70 block mb-1">Expiry Date</label>
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2.5 text-sm min-h-[44px]"
            />
          </div>

          {/* AI extraction details (read-only) */}
          {(draft.client_nric || draft.payment_method || (draft.session_dates && draft.session_dates.length > 0)) && (
            <div className="bg-jai-bg/40 rounded-lg p-3 space-y-1 border border-jai-border">
              <p className="text-[10px] text-jai-text/50 uppercase tracking-wider mb-1">AI-Detected Details</p>
              {draft.client_nric && (
                <p className="text-xs text-jai-text">NRIC: ...{draft.client_nric}</p>
              )}
              {draft.payment_method && (
                <p className="text-xs text-jai-text">Payment: {draft.payment_method}</p>
              )}
              {draft.price_per_session && (
                <p className="text-xs text-jai-text">${draft.price_per_session}/session</p>
              )}
              {draft.session_dates && draft.session_dates.length > 0 && (
                <p className="text-xs text-jai-text">
                  Session dates: {draft.session_dates.join(", ")}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <button
            onClick={handleSave}
            disabled={saving || discarding}
            className="flex-1 py-2.5 text-sm font-medium rounded-lg bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : "Save Client & Package"}
          </button>
          <button
            onClick={handleDiscard}
            disabled={saving || discarding}
            className="py-2.5 px-4 text-sm font-medium rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
          >
            {discarding ? "..." : "Discard"}
          </button>
        </div>
      </div>
    </div>
  );
}
