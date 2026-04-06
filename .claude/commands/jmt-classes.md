# JMT Dashboard — Recurring Classes & Schedule

## Tables
- `classes` — `id`, `name`, `day_of_week` (lowercase string: sunday/monday/...), `start_time` (HH:MM:SS), `duration_minutes`, `lead_coach_id`, `assistant_coach_id`, `is_active`
- `class_coaches` — many-to-many bridge for additional coach assignments beyond lead/assistant (`class_id`, `coach_id`)
- `class_attendance` — per-date attendance records

## Assignment resolution
A coach is "assigned" to a class if ANY of:
1. `classes.lead_coach_id = coach_id`, OR
2. `classes.assistant_coach_id = coach_id`, OR
3. A row exists in `class_coaches` linking them

When iterating recurring classes (e.g. leave conflict detection), check all three sources and de-dupe by class id.

## Supabase join quirk
When selecting `class_coaches` with a join `class:classes(...)`, the `class` field is sometimes returned as an array and sometimes as a single object depending on relationship cardinality detected. Always defensively handle both:
```ts
const raw = (r as { class: unknown }).class;
const c = (Array.isArray(raw) ? raw[0] : raw) as ClsRow | null;
```

## UI
- `src/components/schedule-grid.tsx` — weekly grid (mon-sun × time slots)
- `src/components/schedule-page-client.tsx` — wraps grid + filters
- `src/components/class-modal.tsx` — create/edit class
- Route: `/schedule` inside `(dashboard)` group

## Rules
- Half-day leave detection uses `start_time < "18:30"` string comparison (works because HH:MM format is lexicographically sortable).
- Sundays are excluded from leave-day counting (`current.getDay() !== 0`) — gym closed policy.
- Always check `is_active = true` before flagging a class as a conflict.
