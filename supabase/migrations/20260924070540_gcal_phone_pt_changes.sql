-- Applied as migration 20260924070540. No wider Google permission is required.
alter table public.gcal_event_map add column if not exists pt_baseline jsonb;
alter table public.gcal_connections add column if not exists sync_lock_id uuid;
alter table public.gcal_connections add column if not exists sync_lock_until timestamptz;

create table public.gcal_pt_drafts (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.gcal_connections(id) on delete cascade,
  google_event_id text not null,
  summary text not null,
  scheduled_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes between 1 and 480),
  status text not null default 'pending' check (status in ('pending', 'completed', 'dismissed')),
  pt_session_id uuid references public.pt_sessions(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, google_event_id)
);
create table public.gcal_pt_changes (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.gcal_connections(id) on delete cascade,
  pt_session_id uuid references public.pt_sessions(id) on delete set null,
  google_event_id text not null,
  action text not null check (action in ('rescheduled', 'cancelled')),
  previous_value jsonb not null,
  next_value jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.gcal_pt_drafts enable row level security;
alter table public.gcal_pt_changes enable row level security;
revoke all on public.gcal_pt_drafts, public.gcal_pt_changes from public, anon, authenticated;
grant select, insert, update, delete on public.gcal_pt_drafts, public.gcal_pt_changes to service_role;
create index on public.gcal_pt_drafts(status, created_at);

-- Atomic authorization, optimistic conflict check and audit. Only the server
-- can invoke this function; Google event titles/markers never confer authority.
create or replace function public.apply_gcal_pt_change(
  p_connection_id uuid, p_google_event_id text, p_expected jsonb,
  p_scheduled_at timestamptz, p_duration integer, p_cancel boolean
) returns text language plpgsql security invoker set search_path = public as $$
declare
  connection_row public.gcal_connections%rowtype;
  map_row public.gcal_event_map%rowtype;
  session_row public.pt_sessions%rowtype;
  actor_role text;
  start_local timestamp;
  end_local timestamp;
begin
  select * into connection_row from public.gcal_connections where id = p_connection_id and revoked_at is null;
  if not found then return 'disconnected'; end if;
  select role into actor_role from public.users where id = connection_row.user_id and is_active = true;
  if actor_role is null or actor_role not in ('coach', 'master_admin') then return 'forbidden'; end if;
  select * into map_row from public.gcal_event_map
    where connection_id = p_connection_id and google_event_id = p_google_event_id
      and local_entity_key like 'pt:%' and deleted = false for update;
  if not found or map_row.pt_baseline is null or map_row.pt_baseline <> p_expected then return 'baseline_changed'; end if;
  select * into session_row from public.pt_sessions
    where id::text = substring(map_row.local_entity_key from 4) for update;
  if not found then return 'missing'; end if;
  if actor_role <> 'master_admin' and session_row.coach_id <> connection_row.user_id then return 'forbidden'; end if;
  if session_row.status not in ('scheduled', 'confirmed') then return 'resolved'; end if;
  if session_row.scheduled_at is distinct from (p_expected->>'scheduled_at')::timestamptz
    or session_row.duration_minutes is distinct from (p_expected->>'duration_minutes')::integer
    or session_row.coach_id::text is distinct from p_expected->>'coach_id'
    or session_row.member_id::text is distinct from p_expected->>'member_id'
    or session_row.status is distinct from p_expected->>'status'
    or session_row.edited_at is distinct from (p_expected->>'edited_at')::timestamptz
    then return 'conflict'; end if;
  if not p_cancel then
    if p_scheduled_at is null or not isfinite(p_scheduled_at) or p_scheduled_at <= now()
      or p_duration is null or p_duration not between 1 and 480 then return 'invalid_time'; end if;
    start_local := p_scheduled_at at time zone 'Asia/Singapore';
    end_local := start_local + make_interval(mins => p_duration);
    if exists (select 1 from public.leaves l
      where l.coach_id = session_row.coach_id and l.status = 'approved' and l.deleted_at is null
      and start_local < coalesce(l.leave_end_date, l.leave_date)::timestamp + interval '1 day'
      and end_local > l.leave_date::timestamp
      and (not l.is_half_day or exists (
        select 1 from generate_series(l.leave_date::timestamp, coalesce(l.leave_end_date, l.leave_date)::timestamp, interval '1 day') d
        where start_local < d + case when coalesce(l.half_day_period, 'morning') = 'morning' then interval '18 hours 30 minutes' else interval '1 day' end
          and end_local > d + case when coalesce(l.half_day_period, 'morning') = 'morning' then interval '0 hours' else interval '18 hours 30 minutes' end
      ))) then return 'leave_conflict'; end if;
  end if;
  update public.pt_sessions set
    scheduled_at = case when p_cancel then scheduled_at else p_scheduled_at end,
    duration_minutes = case when p_cancel then duration_minutes else p_duration end,
    status = case when p_cancel then 'cancelled' else status end,
    edited_by = connection_row.user_id, edited_at = now()
    where id = session_row.id;
  insert into public.gcal_pt_changes(connection_id, pt_session_id, google_event_id, action, previous_value, next_value)
    values(p_connection_id, session_row.id, p_google_event_id,
      case when p_cancel then 'cancelled' else 'rescheduled' end,
      p_expected, jsonb_build_object('scheduled_at', p_scheduled_at, 'duration_minutes', p_duration, 'cancelled', p_cancel));
  -- Notify the assigned coach in this same transaction. The baseline lock and
  -- invalidation make retries a no-op; failed notifications roll back the edit.
  if actor_role = 'master_admin' and session_row.coach_id <> connection_row.user_id then
    insert into public.notifications(user_id, sender_id, notification_type, title, message, is_read, action_url)
      values(session_row.coach_id, connection_row.user_id,
        case when p_cancel then 'pt_cancelled' else 'pt_updated' end,
        case when p_cancel then 'PT Session Cancelled' else 'PT Session Rescheduled' end,
        coalesce((select full_name from public.users where id = connection_row.user_id), 'Jeremy') ||
        case when p_cancel then ' cancelled your PT with ' else ' rescheduled your PT with ' end ||
        coalesce((select full_name from public.users where id = session_row.member_id), 'Client') ||
        case when p_cancel then ' on ' else ' from ' end ||
        to_char(session_row.scheduled_at at time zone 'Asia/Singapore', 'DD Mon YYYY HH24:MI') ||
        case when p_cancel then ' (Singapore time).'
          else ' to ' || to_char(p_scheduled_at at time zone 'Asia/Singapore', 'DD Mon YYYY HH24:MI') || ' (Singapore time).' end,
        false, '/pt');
  end if;
  -- Invalidate the old baseline in the same transaction. Retried requests may
  -- never replay against a later edit even if Google has not been updated yet.
  update public.gcal_event_map set pt_baseline = null where id = map_row.id;
  return 'applied';
end;
$$;
revoke all on function public.apply_gcal_pt_change(uuid, text, jsonb, timestamptz, integer, boolean) from public, anon, authenticated;
grant execute on function public.apply_gcal_pt_change(uuid, text, jsonb, timestamptz, integer, boolean) to service_role;

create or replace function public.complete_gcal_pt_draft(
  p_draft_id uuid, p_actor_id uuid, p_member_id uuid, p_coach_id uuid
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  draft public.gcal_pt_drafts%rowtype;
  session_id uuid;
  package_id uuid;
  connection_row public.gcal_connections%rowtype;
  start_local timestamp;
  end_local timestamp;
begin
  if not exists(select 1 from public.users where id = p_actor_id and role = 'master_admin' and is_active = true) then
    raise exception 'Only Jeremy can confirm calendar PT drafts' using errcode = '42501';
  end if;
  select * into draft from public.gcal_pt_drafts where id = p_draft_id for update;
  if not found then raise exception 'PT draft not found'; end if;
  if draft.status = 'completed' then return draft.pt_session_id; end if;
  if draft.status <> 'pending' then raise exception 'PT draft was dismissed'; end if;
  select * into connection_row from public.gcal_connections where id = draft.connection_id and revoked_at is null for update;
  if not found then raise exception 'Calendar disconnected'; end if;
  if connection_row.sync_lock_until > now() then raise exception 'Calendar sync is running; try again shortly'; end if;
  if not exists(select 1 from public.users where id = p_member_id and role = 'member' and is_active = true) then raise exception 'Choose an active PT client'; end if;
  if not exists(select 1 from public.users where id = p_coach_id and role in ('coach', 'master_admin') and is_active = true) then raise exception 'Choose an active coach'; end if;
  if draft.scheduled_at <= now() then raise exception 'Choose a future PT time'; end if;
  start_local := draft.scheduled_at at time zone 'Asia/Singapore';
  end_local := start_local + make_interval(mins => draft.duration_minutes);
  if exists(select 1 from public.leaves l where l.coach_id = p_coach_id and l.status = 'approved' and l.deleted_at is null
    and start_local < coalesce(l.leave_end_date, l.leave_date)::timestamp + interval '1 day' and end_local > l.leave_date::timestamp
    and (not l.is_half_day or exists(select 1 from generate_series(l.leave_date::timestamp, coalesce(l.leave_end_date, l.leave_date)::timestamp, interval '1 day') d
      where start_local < d + case when coalesce(l.half_day_period, 'morning') = 'morning' then interval '18 hours 30 minutes' else interval '1 day' end
      and end_local > d + case when coalesce(l.half_day_period, 'morning') = 'morning' then interval '0 hours' else interval '18 hours 30 minutes' end))) then
    raise exception 'Coach is on approved leave at this time';
  end if;
  select id into package_id from public.pt_packages
    where user_id = p_member_id and preferred_coach_id = p_coach_id and status = 'active'
    order by created_at desc limit 1;
  insert into public.pt_sessions(coach_id, member_id, scheduled_at, duration_minutes, status, package_id, edited_by, edited_at)
    values(p_coach_id, p_member_id, draft.scheduled_at, draft.duration_minutes, 'scheduled', package_id, p_actor_id, now()) returning id into session_id;
  insert into public.gcal_event_map(connection_id, local_entity_key, google_event_id, deleted)
    values(draft.connection_id, 'pt:' || session_id::text, draft.google_event_id, false);
  update public.gcal_pt_drafts set status = 'completed', pt_session_id = session_id, updated_at = now() where id = p_draft_id;
  return session_id;
end;
$$;
revoke all on function public.complete_gcal_pt_draft(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.complete_gcal_pt_draft(uuid, uuid, uuid, uuid) to service_role;

create or replace function public.assign_gcal_class_coaches(
  p_class_id uuid, p_actor_id uuid, p_coach_ids uuid[]
) returns void language plpgsql security invoker set search_path = public as $$
declare selected_id uuid; position integer := 0; class_row public.classes%rowtype; conflict_label text;
begin
  if not exists(select 1 from public.users where id = p_actor_id and role = 'master_admin' and is_active = true) then
    raise exception 'Only Jeremy can assign class coaches' using errcode = '42501';
  end if;
  select * into class_row from public.classes where id = p_class_id and is_active = true and event_date is null for update;
  if not found then raise exception 'Recurring class not found'; end if;
  if p_coach_ids is null or cardinality(p_coach_ids) not between 1 and 10
    or (select count(distinct t.coach_id) from unnest(p_coach_ids) t(coach_id)) <> cardinality(p_coach_ids)
    or exists(select 1 from unnest(p_coach_ids) t(coach_id) where not exists(select 1 from public.users u where u.id = t.coach_id and u.role in ('coach','master_admin') and u.is_active = true)) then
    raise exception 'Choose one or more active coaches without duplicates';
  end if;
  select u.full_name || ' is on approved leave on ' || to_char(d, 'DD Mon YYYY') into conflict_label
    from public.leaves l join public.users u on u.id = l.coach_id
    cross join lateral generate_series(greatest(l.leave_date, (now() at time zone 'Asia/Singapore')::date)::timestamp,
      coalesce(l.leave_end_date, l.leave_date)::timestamp, interval '1 day') d
    where l.coach_id = any(p_coach_ids) and l.status = 'approved' and l.deleted_at is null
      and lower(trim(to_char(d, 'Day'))) = class_row.day_of_week
      and (not l.is_half_day
        or (coalesce(l.half_day_period, 'morning') = 'morning' and class_row.start_time < time '18:30')
        or (l.half_day_period = 'evening' and class_row.end_time > time '18:30'))
    order by d limit 1;
  if conflict_label is not null then raise exception '%; choose another coach for this recurring class', conflict_label; end if;
  update public.classes set lead_coach_id = p_coach_ids[1], assistant_coach_id = p_coach_ids[2] where id = p_class_id;
  delete from public.class_coaches where class_id = p_class_id and not (coach_id = any(p_coach_ids));
  foreach selected_id in array p_coach_ids loop
    position := position + 1;
    update public.class_coaches set is_lead = (position = 1) where class_id = p_class_id and coach_id = selected_id;
    if not found then insert into public.class_coaches(class_id, coach_id, is_lead) values(p_class_id, selected_id, position = 1); end if;
  end loop;
end;
$$;
revoke all on function public.assign_gcal_class_coaches(uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.assign_gcal_class_coaches(uuid, uuid, uuid[]) to service_role;
