-- Additive lifecycle automation foundation. Unapplied until reviewed.

alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads
  add constraint leads_status_check
  check (status = any (array['new','contacted','scheduled','showed','won','lost']));

create table if not exists public.lead_stage_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete restrict,
  from_status text not null check (from_status in ('new','contacted','scheduled','showed','won','lost')),
  to_status text not null check (to_status in ('new','contacted','scheduled','showed','won','lost')),
  trigger text not null,
  idempotency_key text not null unique,
  actor_type text not null check (actor_type in ('admin','coach','jai','system')),
  actor_id uuid references auth.users(id) on delete set null,
  source_schema text,
  source_table text,
  source_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists lead_stage_events_lead_timeline_idx
  on public.lead_stage_events (lead_id, created_at desc);
create index if not exists lead_stage_events_actor_idx
  on public.lead_stage_events (actor_id)
  where actor_id is not null;
create index if not exists lead_stage_events_source_idx
  on public.lead_stage_events (source_schema, source_table, source_key)
  where source_key is not null;

alter table public.lead_stage_events enable row level security;
revoke all on public.lead_stage_events from public, anon, authenticated;
grant select, insert on public.lead_stage_events to service_role;

create or replace function public.prevent_lead_stage_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'lead_stage_events are immutable';
end;
$$;

drop trigger if exists lead_stage_events_immutable on public.lead_stage_events;
create trigger lead_stage_events_immutable
before update or delete on public.lead_stage_events
for each row execute function public.prevent_lead_stage_event_mutation();

revoke all on function public.prevent_lead_stage_event_mutation() from public, anon, authenticated;

-- Atomic compare-and-set + event append. The application decides whether the
-- requested transition is allowed; this function guarantees status/event
-- consistency and retry idempotency. Service role only.
create or replace function public.apply_lead_stage_transition(
  p_lead_id uuid,
  p_expected_from text,
  p_to_status text,
  p_trigger text,
  p_idempotency_key text,
  p_actor_type text,
  p_actor_id uuid default null,
  p_source_schema text default null,
  p_source_table text default null,
  p_source_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status text;
begin
  if exists (
    select 1 from public.lead_stage_events
    where idempotency_key = p_idempotency_key
  ) then
    return 'duplicate';
  end if;

  select status into current_status
  from public.leads
  where id = p_lead_id
  for update;

  if current_status is null then return 'not_found'; end if;
  if current_status <> p_expected_from then return 'conflict'; end if;

  update public.leads
  set status = p_to_status, updated_at = now()
  where id = p_lead_id and status = p_expected_from;

  insert into public.lead_stage_events (
    lead_id, from_status, to_status, trigger, idempotency_key,
    actor_type, actor_id, source_schema, source_table, source_key, metadata
  ) values (
    p_lead_id, p_expected_from, p_to_status, p_trigger, p_idempotency_key,
    p_actor_type, p_actor_id, p_source_schema, p_source_table, p_source_key, coalesce(p_metadata, '{}'::jsonb)
  );
  return 'applied';
end;
$$;

revoke all on function public.apply_lead_stage_transition(uuid,text,text,text,text,text,uuid,text,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_lead_stage_transition(uuid,text,text,text,text,text,uuid,text,text,text,jsonb)
  to service_role;
