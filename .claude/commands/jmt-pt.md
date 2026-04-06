# JMT Dashboard — Personal Training Sessions

## Table
- `pt_sessions` — `id`, `coach_id`, `member_id` (nullable; walk-ins stored as name only), `scheduled_at` (timestamptz UTC), `duration_minutes`, `status` (scheduled/completed/cancelled/no_show), `notes`, `edited_by`, `edited_at`

## Server actions — `src/app/actions/pt.ts`
- `coachUpdatePtStatus(sessionId, status)` — coach marks own session completed/cancelled/no_show
- `coachReschedulePtSession(sessionId, newScheduledAtISO, newDurationMinutes)` — coach reschedules own future session. Validates ownership + status not resolved. Writes `edited_by`+`edited_at`, notifies all admins with formatted SGT date/time.
- Admin has additional actions for creating/deleting sessions.

## UI
- `src/components/pt-card.tsx` — coach-facing card with inline expand. Shows member name, time, duration, status pill. When clicked (and not resolved), expands with:
  - Tap-to-call phone link
  - Reschedule button → inline date/time/duration picker
  - Status buttons: Completed / No Show / Cancelled
- `pt-page-client.tsx` — list view grouped by today/upcoming/past.

## Reschedule flow
- `openReschedule()` pre-fills with current SGT time (`toLocaleString` trick).
- `handleReschedule()` constructs `${newDate}T${newTime}:00+08:00` then `.toISOString()` for UTC write.
- Duration options: 30/45/60/90/120 min.
- Notifies all admins via `createNotification()` — Jeremy sees "Coach X rescheduled PT with Member Y from [old] to [new]".

## Rules
- Past but unresolved sessions CAN still be rescheduled (useful when someone misses a session and both parties want to move it).
- Only blocks if the NEW time is in the past.
- Resolved status (completed/cancelled/no_show) freezes the card — no reschedule, no status change.
