-- Track when the 24h trial reminder cron successfully delivered for each
-- trial booking, so the 6h backstop cron can skip already-pinged trials.
--
-- Set by: src/app/api/cron/trial-reminder-24h/route.ts after successful
-- Telegram delivery to at least one recipient.
-- Read by: src/app/api/cron/trial-reminder-backstop/route.ts to filter out
-- trials already covered by the 24h cron.

alter table public.trial_bookings
  add column if not exists reminder_24h_sent_at timestamptz;

create index if not exists trial_bookings_reminder_24h_sent_at_idx
  on public.trial_bookings (reminder_24h_sent_at);
