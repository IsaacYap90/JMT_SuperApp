# JMT Dashboard — Trial Management

## Tables
- `trials` — trial signups/bookings (name, contact, trial_date, status, source)
- `trial_settings` — configurable trial policies (free trial enabled, lead-time requirements, auto-reply templates)

## Server actions — `src/app/actions/trials.ts`
- CRUD for trial bookings, status transitions, conversion tracking.

## UI
- `src/components/trial-management-client.tsx` — list/filter trial bookings, mark attended/converted/no-show.
- `src/components/trial-settings-client.tsx` — edit trial policies (admin only).
- Routes: `/trial-management`, `/trial-settings` inside `(dashboard)` group.

## Rules
- Trial-to-member conversion should update `users` table with `role = 'member'` (not `coach`).
- Don't auto-charge trial users — payment happens after manual admin action.
