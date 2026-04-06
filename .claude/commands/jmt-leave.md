# JMT Dashboard — Leave System

## Tables
- `leaves` — `coach_id`, `leave_date`, `leave_end_date`, `leave_type` (annual/sick/hospital/emergency), `is_half_day`, `reason`, `status` (pending/approved/rejected), `reviewed_by`, `reviewed_at`

## Entitlements (per year, coach view)
- Annual: 14 days
- MC (sick): 14 days
- Hospital: 60 days
- Emergency: untracked (ad-hoc)
- Days calculation: Sundays are excluded (gym closed). Half day counts as 0.5.

## Half-day rule (JMT-specific — Option A)
- "Half day" at JMT = **off before 6:30pm, teaching evening (6:30pm onwards)**
- NOT a generic AM/PM split. There is only one direction: morning/early-afternoon off, evening on.
- Conflict detection: a half-day leave only flags recurring classes where `start_time < 18:30`.
- Form label reads: `Half Day (off before 6:30pm, teaching evening)`.

## Server actions — `src/app/actions/leave.ts`
- `submitLeave({leave_date, leave_end_date, leave_type, is_half_day, reason})` — inserts pending leave, calls `findAffectedClasses` with `is_half_day`, notifies all admins with conflict line if any.
- `reviewLeave(leaveId, "approved"|"rejected")` — updates status + reviewer, notifies coach of decision, re-notifies admins on approval if substitutes still needed.
- `cancelLeave(leaveId)` — coach only, own future leaves only.
- `findAffectedClasses(coachId, start, end, isHalfDay)` — queries `classes.lead_coach_id`, `classes.assistant_coach_id`, and `class_coaches` join; iterates dates in range matching `day_of_week`; filters out `start_time >= 18:30` when half-day.

## UI
- `src/components/leave-page-client.tsx` — shows balance cards (remaining/total), apply form (coach), approve/reject buttons (admin), cancel button (coach, future only).
- Route: `/leave` inside `(dashboard)` group.

## Notifications
- Sent via `createNotification()` from `src/app/actions/notifications.ts` (in-app bell).
- Admin notifications include ⚠️ emoji + per-class conflict list when a coach's leave conflicts with their recurring assignments.
- Coach gets approval/rejection notification after Jeremy reviews.
