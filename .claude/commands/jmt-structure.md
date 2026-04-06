# JMT Dashboard — Project Structure

## Routes (`src/app/`)
- `/login`, `/change-password`, `/book` — public
- `(dashboard)/` — authed, protected by middleware
  - `page.tsx` — home (admin or coach dashboard based on role)
  - `leave/` — leave system
  - `pt/` — personal training sessions
  - `schedule/` — recurring class grid
  - `sunday-prep/` — weekly prep checklist
  - `trial-management/`, `trial-settings/` — trials
  - `earning/` — coach earnings
  - `profile/` — user profile

## Server actions (`src/app/actions/`)
- `auth.ts` — login, password change, session helpers
- `leave.ts` — leave submission/review/cancel + class conflict detection
- `notifications.ts` — `createNotification(userId, type, title, message)` in-app bell
- `pt.ts` — PT session status + coach reschedule
- `trials.ts` — trial CRUD + conversion

## Components (`src/components/`)
- `admin-dashboard.tsx`, `coach-dashboard.tsx` — role-specific home views
- `schedule-grid.tsx`, `schedule-page-client.tsx`, `class-modal.tsx`, `coach-schedule.tsx` — schedule
- `pt-card.tsx`, `pt-page-client.tsx` — PT sessions
- `leave-page-client.tsx`, `date-range-picker.tsx` — leave
- `trial-management-client.tsx`, `trial-settings-client.tsx` — trials
- `sunday-prep-client.tsx` — Sunday prep
- `earning-client.tsx` — earnings
- `notification-bell.tsx` — in-app notification dropdown
- `sidebar.tsx` — main nav
- `metric-card.tsx` — dashboard stat widget

## Tables (Supabase, project `xioimcyqglfxqumvbqsg`)
- `users` — mirrors `auth.users` with `role` (coach/admin/master_admin), `full_name`, `phone`
- `classes` — recurring weekly classes with `day_of_week`, `start_time`, `lead_coach_id`, `assistant_coach_id`, `is_active`
- `class_coaches` — extra coach ↔ class assignments
- `class_attendance` — per-date attendance
- `pt_sessions` — personal training bookings
- `leaves` — leave applications
- `notifications` — in-app bell notifications
- `trials`, `trial_settings` — trial signup management
- `earnings` — per-coach earning records

## Auth
- Supabase Auth (email/password).
- `createClient()` from `@/lib/supabase/server` — request-scoped, respects RLS.
- `createAdminClient()` from `@/lib/supabase/admin` — service role, bypasses RLS; use in server actions that need cross-user writes (e.g. notifying other admins).

## Telegram bot (optional)
- `JMT_TELEGRAM_BOT_TOKEN` + `JMT_TELEGRAM_USER_MAP` env vars on Vercel.
- `JMT_TELEGRAM_USER_MAP` = JSON like `{"<userId>":"<chatId>"}` — send push notifications to specific users.
- Jeremy's chat ID is added when he `/start`s the bot and Isaac confirms.
