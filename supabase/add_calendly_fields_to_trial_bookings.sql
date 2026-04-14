-- Adds Calendly integration fields to trial_bookings so we can:
--   1. Dedupe incoming webhook deliveries (Calendly retries on failure)
--   2. Handle cancellations by looking up the booking by its Calendly event URI
--
-- Apply once in Supabase SQL editor. Idempotent.

alter table public.trial_bookings
  add column if not exists calendly_event_uri text,
  add column if not exists source text not null default 'manual';

-- Dedup + fast cancellation lookup
create unique index if not exists trial_bookings_calendly_event_uri_key
  on public.trial_bookings (calendly_event_uri)
  where calendly_event_uri is not null;

-- Sanity constraint on source values
alter table public.trial_bookings
  drop constraint if exists trial_bookings_source_check;
alter table public.trial_bookings
  add constraint trial_bookings_source_check
  check (source in ('manual', 'calendly', 'public_form'));
