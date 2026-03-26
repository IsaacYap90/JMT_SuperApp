"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Earning, EarningType } from "@/lib/types/database";

const TYPE_LABELS: Record<EarningType, string> = {
  salary: "Basic Salary",
  pt_weekly: "Weekly PT",
  bonus: "Bonus",
  other: "Other",
};

const TYPE_COLORS: Record<EarningType, string> = {
  salary: "bg-jai-blue/10 text-jai-blue border-jai-blue/20",
  pt_weekly: "bg-green-500/10 text-green-400 border-green-500/20",
  bonus: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  other: "bg-jai-text/10 text-jai-text border-jai-border",
};

export function EarningClient({
  earnings: initialEarnings,
  coachId,
}: {
  earnings: Earning[];
  coachId: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [earnings, setEarnings] = useState<Earning[]>(initialEarnings);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    type: "pt_weekly" as EarningType,
    amount: "",
    description: "",
  });
  const [saving, setSaving] = useState(false);

  // Calculate totals
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = `${currentYear}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // This week (Mon-Sun)
  const today = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() + mondayOffset);
  const weekStartStr = weekStart.toISOString().split("T")[0];
  const sundayEnd = new Date(weekStart);
  sundayEnd.setDate(weekStart.getDate() + 6);
  const weekEndStr = sundayEnd.toISOString().split("T")[0];

  const weekEarnings = earnings.filter((e) => e.date >= weekStartStr && e.date <= weekEndStr);
  const weekTotal = weekEarnings.reduce((sum, e) => sum + e.amount, 0);

  // MTD
  const monthEarnings = earnings.filter((e) => e.date.startsWith(currentMonth));
  const monthTotal = monthEarnings.reduce((sum, e) => sum + e.amount, 0);
  const monthSalary = monthEarnings.filter((e) => e.type === "salary").reduce((s, e) => s + e.amount, 0);
  const monthPt = monthEarnings.filter((e) => e.type === "pt_weekly").reduce((s, e) => s + e.amount, 0);

  // YTD
  const ytdEarnings = earnings.filter((e) => e.date.startsWith(String(currentYear)));
  const ytdTotal = ytdEarnings.reduce((sum, e) => sum + e.amount, 0);

  const handleSubmit = async () => {
    if (!form.amount || !form.date) return;
    setSaving(true);

    const payload = {
      coach_id: coachId,
      date: form.date,
      type: form.type,
      amount: parseFloat(form.amount),
      description: form.description || null,
    };

    if (editingId) {
      await supabase.from("earnings").update(payload).eq("id", editingId);
    } else {
      await supabase.from("earnings").insert(payload);
    }

    setShowForm(false);
    setEditingId(null);
    setForm({ date: new Date().toISOString().split("T")[0], type: "pt_weekly", amount: "", description: "" });
    setSaving(false);
    router.refresh();

    // Refetch
    const { data } = await supabase
      .from("earnings")
      .select("*")
      .eq("coach_id", coachId)
      .order("date", { ascending: false });
    if (data) setEarnings(data as Earning[]);
  };

  const handleEdit = (e: Earning) => {
    setForm({
      date: e.date,
      type: e.type,
      amount: String(e.amount),
      description: e.description || "",
    });
    setEditingId(e.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("earnings").delete().eq("id", id);
    setEarnings((prev) => prev.filter((e) => e.id !== id));
    router.refresh();
  };

  // Group by month
  const grouped: Record<string, Earning[]> = {};
  for (const e of earnings) {
    const month = e.date.slice(0, 7);
    if (!grouped[month]) grouped[month] = [];
    grouped[month].push(e);
  }
  const months = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold">Earning</h1>
        <button
          onClick={() => {
            setEditingId(null);
            setForm({ date: new Date().toISOString().split("T")[0], type: "pt_weekly", amount: "", description: "" });
            setShowForm(true);
          }}
          className="px-4 py-2.5 bg-jai-blue text-white text-sm rounded-lg hover:bg-jai-blue/90 transition-colors min-h-[44px]"
        >
          + Add Entry
        </button>
      </div>

      {/* Weekly / MTD / YTD Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-jai-card border border-jai-border rounded-xl p-3 text-center">
          <p className="text-[10px] text-jai-text uppercase tracking-wide">This Week</p>
          <p className="text-lg font-bold mt-1">${weekTotal.toLocaleString()}</p>
        </div>
        <div className="bg-jai-card border border-jai-border rounded-xl p-3 text-center">
          <p className="text-[10px] text-jai-text uppercase tracking-wide">MTD</p>
          <p className="text-lg font-bold text-jai-blue mt-1">${monthTotal.toLocaleString()}</p>
        </div>
        <div className="bg-jai-card border border-jai-border rounded-xl p-3 text-center">
          <p className="text-[10px] text-jai-text uppercase tracking-wide">YTD</p>
          <p className="text-lg font-bold text-green-400 mt-1">${ytdTotal.toLocaleString()}</p>
        </div>
      </div>

      {/* This Month Breakdown */}
      <div className="bg-jai-card border border-jai-border rounded-xl p-4 space-y-2">
        <h3 className="text-sm font-semibold text-jai-text uppercase tracking-wide mb-2">
          {now.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
        </h3>
        <div className="flex items-center justify-between text-sm">
          <span className="text-jai-text">Basic Salary</span>
          <span className="font-medium">${monthSalary.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-jai-text">Weekly PT</span>
          <span className="font-medium text-green-400">${monthPt.toLocaleString()}</span>
        </div>
        <div className="border-t border-jai-border pt-2 mt-2 flex items-center justify-between text-sm">
          <span className="font-semibold">Total</span>
          <span className="font-bold text-jai-blue">${monthTotal.toLocaleString()}</span>
        </div>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="bg-jai-card border border-jai-border rounded-xl p-4 space-y-4">
          <h3 className="font-semibold text-sm">{editingId ? "Edit Entry" : "Add Entry"}</h3>
          <div>
            <label className="text-xs text-jai-text block mb-1">Date</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2.5 text-sm min-h-[44px]"
            />
          </div>
          <div>
            <label className="text-xs text-jai-text block mb-1">Type</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as EarningType })}
              className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2.5 text-sm min-h-[44px]"
            >
              <option value="salary">Basic Salary</option>
              <option value="pt_weekly">Weekly PT</option>
              <option value="bonus">Bonus</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-jai-text block mb-1">Amount ($)</label>
            <input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2.5 text-sm min-h-[44px]"
            />
          </div>
          <div>
            <label className="text-xs text-jai-text block mb-1">Description (optional)</label>
            <input
              type="text"
              placeholder="e.g. March Week 3 PT"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2.5 text-sm min-h-[44px]"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={saving || !form.amount}
              className="flex-1 py-2.5 bg-jai-blue text-white text-sm rounded-lg hover:bg-jai-blue/90 transition-colors disabled:opacity-50 min-h-[44px]"
            >
              {saving ? "Saving..." : editingId ? "Update" : "Save"}
            </button>
            <button
              onClick={() => { setShowForm(false); setEditingId(null); }}
              className="px-4 py-2.5 border border-jai-border text-jai-text text-sm rounded-lg hover:bg-white/5 transition-colors min-h-[44px]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Entries grouped by month */}
      {months.map((month) => {
        const monthEntries = grouped[month];
        const total = monthEntries.reduce((s, e) => s + e.amount, 0);
        const monthDate = new Date(month + "-01");
        const label = monthDate.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

        return (
          <section key={month}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-jai-text uppercase tracking-wide">
                {label}
              </h3>
              <span className="text-sm font-medium">${total.toLocaleString()}</span>
            </div>
            <div className="space-y-2">
              {monthEntries.map((e) => (
                <div
                  key={e.id}
                  className="bg-jai-card border border-jai-border rounded-xl p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">${e.amount.toLocaleString()}</p>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${TYPE_COLORS[e.type]}`}>
                          {TYPE_LABELS[e.type]}
                        </span>
                      </div>
                      <p className="text-jai-text text-xs mt-1">
                        {new Date(e.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        {e.description && ` — ${e.description}`}
                      </p>
                    </div>
                    <div className="flex gap-1 ml-2">
                      <button
                        onClick={() => handleEdit(e)}
                        className="p-2 text-jai-text hover:text-white min-w-[44px] min-h-[44px] flex items-center justify-center"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(e.id)}
                        className="p-2 text-jai-text hover:text-red-400 min-w-[44px] min-h-[44px] flex items-center justify-center"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {earnings.length === 0 && !showForm && (
        <div className="bg-jai-card border border-jai-border rounded-xl p-6 text-center">
          <p className="text-jai-text">No earnings recorded yet. Tap + Add Entry to start.</p>
        </div>
      )}
    </div>
  );
}
