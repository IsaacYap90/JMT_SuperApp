"use client";

import { useEffect, useMemo, useState } from "react";
import { mergeClients, DuplicateGroup, MergePayload } from "@/app/actions/pt";

export function MergeClientsDialog({
  group,
  onClose,
  onMerged,
}: {
  group: DuplicateGroup | null;
  onClose: () => void;
  onMerged: (summary: string) => void;
}) {
  const [winnerId, setWinnerId] = useState<string>("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [payPerClass, setPayPerClass] = useState(false);
  const [price, setPrice] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!group) return;
    // Default winner = first in list (already sorted by richest data).
    const w = group.clients[0];
    setWinnerId(w.id);
    setName(w.full_name);
    setPhone(w.phone || "");
    // Pay-per-class: true if ANY candidate has it.
    const anyPpc = group.clients.some(c => c.pt_pay_per_class);
    setPayPerClass(anyPpc);
    // Default price: first non-null value across candidates.
    const anyPrice = group.clients.find(c => c.pt_default_price_per_class != null)?.pt_default_price_per_class ?? null;
    setPrice(anyPrice != null ? String(anyPrice) : "");
    setError(null);
  }, [group]);

  const loserIds = useMemo(
    () => (group ? group.clients.filter(c => c.id !== winnerId).map(c => c.id) : []),
    [group, winnerId]
  );

  if (!group) return null;

  const handleConfirm = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload: MergePayload = {
        full_name: name.trim() || "Client",
        phone: phone.trim() || null,
        pt_pay_per_class: payPerClass,
        pt_default_price_per_class: payPerClass && price ? parseFloat(price) : null,
      };
      const result = await mergeClients(winnerId, loserIds, payload);
      const bits = [
        result.sessions_moved > 0 ? `${result.sessions_moved} session${result.sessions_moved === 1 ? "" : "s"}` : null,
        result.packages_moved > 0 ? `${result.packages_moved} package${result.packages_moved === 1 ? "" : "s"}` : null,
        result.contracts_moved > 0 ? `${result.contracts_moved} contract${result.contracts_moved === 1 ? "" : "s"}` : null,
      ].filter(Boolean);
      const summary = bits.length > 0 ? `Merged. Moved ${bits.join(", ")} to the kept record.` : "Merged. No related records to move.";
      onMerged(summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to merge");
    }
    setSaving(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-jai-bg border border-jai-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 space-y-4">
          <div>
            <p className="text-sm font-semibold">Merge duplicate clients</p>
            <p className="text-xs text-jai-text/60">
              Phone {group.phone} · {group.clients.length} records with the same number
            </p>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wider text-jai-text/60 mb-2">
              Pick the record to keep
            </p>
            <div className="space-y-1.5">
              {group.clients.map((c) => (
                <label
                  key={c.id}
                  className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                    winnerId === c.id
                      ? "bg-jai-blue/10 border-jai-blue/40"
                      : "bg-jai-card border-jai-border hover:bg-jai-card/60"
                  }`}
                >
                  <input
                    type="radio"
                    name="winner"
                    checked={winnerId === c.id}
                    onChange={() => {
                      setWinnerId(c.id);
                      setName(c.full_name);
                      setPhone(c.phone || "");
                    }}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.full_name}</p>
                    <p className="text-[11px] text-jai-text/70 truncate">{c.phone || "—"}</p>
                    <p className="text-[10px] text-jai-text/50 mt-0.5">
                      {c.session_count} session{c.session_count === 1 ? "" : "s"} · {c.package_count} package{c.package_count === 1 ? "" : "s"}
                      {c.pt_pay_per_class ? " · per class" : ""}
                      {c.pt_default_price_per_class != null ? ` · $${c.pt_default_price_per_class}` : ""}
                    </p>
                  </div>
                </label>
              ))}
            </div>
            <p className="text-[10px] text-jai-text/50 mt-2">
              The other {loserIds.length} record{loserIds.length === 1 ? "" : "s"} will be archived. All their sessions, packages & contracts move to the kept record.
            </p>
          </div>

          <div className="space-y-2 pt-2 border-t border-jai-border">
            <p className="text-[10px] uppercase tracking-wider text-jai-text/60">
              Final details (applied to the kept record)
            </p>
            <div>
              <label className="block text-[10px] text-jai-text/60 mb-1">Full name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-jai-card border border-jai-border rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] text-jai-text/60 mb-1">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-jai-card border border-jai-border rounded-md px-3 py-2 text-sm"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-jai-text cursor-pointer select-none pt-1">
              <input
                type="checkbox"
                checked={payPerClass}
                onChange={(e) => setPayPerClass(e.target.checked)}
                className="w-4 h-4"
              />
              Pay-per-class client
            </label>
            {payPerClass && (
              <div>
                <label className="block text-[10px] text-jai-text/60 mb-1">Default price per class (SGD)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="e.g. 80"
                  className="w-full bg-jai-card border border-jai-border rounded-md px-3 py-2 text-sm"
                />
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-xs rounded-lg p-2.5">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="flex-1 py-2.5 text-sm font-medium rounded-lg bg-jai-card border border-jai-border text-jai-text/70 hover:bg-jai-card/60 disabled:opacity-50 min-h-[44px]"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={saving || !winnerId}
              className="flex-1 py-2.5 text-sm font-medium rounded-lg bg-jai-blue text-white hover:bg-jai-blue/90 disabled:opacity-50 min-h-[44px]"
            >
              {saving ? "Merging..." : "Merge records"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
