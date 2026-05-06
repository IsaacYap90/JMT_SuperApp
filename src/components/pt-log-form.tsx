"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { logPtSession } from "@/app/actions/pt";
import { Button } from "./ui/button";

export function PtLogForm({
  sessionId,
  initialCoachNotes,
  initialNextFocus,
}: {
  sessionId: string;
  initialCoachNotes: string;
  initialNextFocus: string;
}) {
  const router = useRouter();
  const [coachNotes, setCoachNotes] = useState(initialCoachNotes);
  const [nextFocus, setNextFocus] = useState(initialNextFocus);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await logPtSession(sessionId, coachNotes, nextFocus);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError((e as Error).message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs text-jai-text mb-1.5">What we did today</label>
        <textarea
          value={coachNotes}
          onChange={(e) => setCoachNotes(e.target.value)}
          placeholder="Pad work · 3 rounds jab-cross-hook combinations · defensive slips. Member picked up timing on the counter."
          rows={6}
          className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2.5 text-sm"
        />
      </div>

      <div>
        <label className="block text-xs text-jai-text mb-1.5">Focus next session</label>
        <textarea
          value={nextFocus}
          onChange={(e) => setNextFocus(e.target.value)}
          placeholder="Work on foot positioning during the counter. Introduce teep."
          rows={4}
          className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2.5 text-sm"
        />
      </div>

      {error && (
        <div className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <Button
        onClick={handleSave}
        disabled={saving}
        loading={saving}
        loadingText="Saving…"
        variant={saved ? "secondary" : "primary"}
        size="lg"
        fullWidth
        className={saved ? "!bg-green-500/20 !text-green-400 !border-green-500/30" : ""}
      >
        {saved ? "Saved ✓" : "Save log"}
      </Button>

      <Button
        onClick={() => router.push("/")}
        variant="ghost"
        size="sm"
        fullWidth
      >
        Back to overview
      </Button>
    </div>
  );
}
