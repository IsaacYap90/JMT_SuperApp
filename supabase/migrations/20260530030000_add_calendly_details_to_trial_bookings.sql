-- Stores the full Calendly submission (email + every question/answer) so the
-- Trials tab can show everything the invitee submitted on the booking form.
-- Additive + idempotent.

alter table public.trial_bookings
  add column if not exists calendly_details jsonb;
