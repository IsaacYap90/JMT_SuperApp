"use client";

import { useState } from "react";
import { completeGoogleCalendarPtDraft, assignGoogleCalendarClassCoaches } from "@/app/actions/calendar-manage";
import { Button } from "@/components/ui/button";

type Person = { id: string; full_name: string };

export function CalendarManageClient({
  draft,
  classItem,
  members,
  coaches,
}: {
  draft: { id: string; summary: string; scheduledAt: string; durationMinutes: number } | null;
  classItem: { id: string; name: string; assignedCoachIds: string[] } | null;
  members: Person[];
  coaches: Person[];
}) {
  const [memberId, setMemberId] = useState("");
  const [coachId, setCoachId] = useState("");
  const [coachIds, setCoachIds] = useState<string[]>(classItem?.assignedCoachIds || []);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const finishDraft = async () => {
    if (!draft || !memberId || !coachId) return;
    setSaving(true); setMessage("");
    try {
      await completeGoogleCalendarPtDraft(draft.id, memberId, coachId);
      setMessage("PT added to JMT OS. It will appear in the assigned coach’s calendar on the next sync.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not create PT");
    } finally { setSaving(false); }
  };

  const saveClass = async () => {
    if (!classItem) return;
    setSaving(true); setMessage("");
    try {
      await assignGoogleCalendarClassCoaches(classItem.id, coachIds);
      setMessage("Coach assignment saved. Class day and time were not changed.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save coaches");
    } finally { setSaving(false); }
  };

  const toggleCoach = (id: string) => setCoachIds((current) => current.includes(id)
    ? current.filter((coach) => coach !== id)
    : [...current, id]);

  if (draft) return <section className="max-w-lg space-y-5">
    <div><h1 className="text-2xl font-bold text-white">Finish new PT</h1><p className="mt-1 text-jai-text">{draft.summary || "Calendar PT"} · {new Date(draft.scheduledAt).toLocaleString("en-GB", { timeZone: "Asia/Singapore" })} · {draft.durationMinutes} min</p></div>
    <p className="rounded-lg border border-jai-border bg-jai-card p-3 text-sm text-jai-text">Calendar cannot safely know the client or coach. Choose both here before JMT creates the session.</p>
    <label className="block text-sm text-jai-text">Client<select value={memberId} onChange={(e) => setMemberId(e.target.value)} className="mt-1 w-full rounded-lg border border-jai-border bg-jai-bg px-3 py-3 text-white"><option value="">Choose client</option>{members.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}</select></label>
    <label className="block text-sm text-jai-text">Coach<select value={coachId} onChange={(e) => setCoachId(e.target.value)} className="mt-1 w-full rounded-lg border border-jai-border bg-jai-bg px-3 py-3 text-white"><option value="">Choose coach</option>{coaches.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}</select></label>
    <Button variant="primary" size="lg" fullWidth disabled={!memberId || !coachId} loading={saving} loadingText="Adding…" onClick={finishDraft}>Add PT to JMT OS</Button>
    {message && <p className="text-sm text-jai-text">{message}</p>}
  </section>;

  if (classItem) return <section className="max-w-lg space-y-5">
    <div><h1 className="text-2xl font-bold text-white">Assign class coaches</h1><p className="mt-1 text-jai-text">{classItem.name}</p></div>
    <p className="rounded-lg border border-jai-border bg-jai-card p-3 text-sm text-jai-text">This changes the recurring coach assignment only. Class day and time stay fixed.</p>
    <div className="space-y-2">{coaches.map((person) => <label key={person.id} className="flex items-center gap-3 rounded-lg border border-jai-border bg-jai-card px-3 py-3 text-white"><input type="checkbox" checked={coachIds.includes(person.id)} onChange={() => toggleCoach(person.id)} className="h-5 w-5" />{person.full_name}</label>)}</div>
    <Button variant="primary" size="lg" fullWidth loading={saving} loadingText="Saving…" onClick={saveClass}>Save coach assignment</Button>
    {message && <p className="text-sm text-jai-text">{message}</p>}
  </section>;

  return <section className="max-w-lg"><h1 className="text-2xl font-bold text-white">Calendar action</h1><p className="mt-2 text-jai-text">This calendar item is no longer available.</p></section>;
}
