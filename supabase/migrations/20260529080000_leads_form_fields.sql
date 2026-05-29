-- Store the full set of fields a lead submitted on the Meta lead form, so the
-- admin lead detail can show everything (not just name/phone/email/interest).
-- Populated going forward by the meta-lead-sync cron; existing rows stay null.
alter table public.leads
  add column if not exists form_fields jsonb;
