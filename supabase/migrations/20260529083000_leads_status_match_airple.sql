-- Match JMT lead stages to Airple / Lead OS: new → contacted → scheduled → won → lost.
-- Renames the old "converted" stage to "won" and updates the status CHECK.
update public.leads set status = 'won' where status = 'converted';

alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads
  add constraint leads_status_check
  check (status = any (array['new','contacted','scheduled','won','lost']));
