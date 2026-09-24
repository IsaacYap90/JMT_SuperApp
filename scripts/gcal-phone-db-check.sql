-- Synthetic schema for isolated PostgreSQL regression checks. No live data.
\set ON_ERROR_STOP on
create role anon;
create role authenticated;
create role service_role bypassrls;
create table users(id uuid primary key, full_name text, role text, is_active boolean default true);
create table pt_packages(id uuid primary key default gen_random_uuid(), user_id uuid, preferred_coach_id uuid, status text, created_at timestamptz default now());
create table pt_sessions(id uuid primary key default gen_random_uuid(), coach_id uuid, member_id uuid, scheduled_at timestamptz, duration_minutes integer, status text, edited_at timestamptz, edited_by uuid, package_id uuid);
create table leaves(id uuid primary key default gen_random_uuid(), coach_id uuid, status text, deleted_at timestamptz, leave_date date, leave_end_date date, is_half_day boolean, half_day_period text);
create table classes(id uuid primary key, is_active boolean, event_date date, day_of_week text, lead_coach_id uuid, assistant_coach_id uuid, start_time time, end_time time);
create table class_coaches(class_id uuid, coach_id uuid, is_lead boolean, unique(class_id,coach_id));
\i /repo/supabase/migrations/20260920142820_google_calendar_sync.sql
\i /repo/supabase/migrations/20260921154616_gcal_phone_pt_changes.sql
grant usage on schema public to service_role, anon, authenticated;
grant all on users, pt_packages, pt_sessions, leaves, classes, class_coaches to service_role;

insert into users values
('00000000-0000-0000-0000-000000000001','Jeremy','master_admin',true),
('00000000-0000-0000-0000-000000000002','Coach A','coach',true),
('00000000-0000-0000-0000-000000000003','Coach B','coach',true),
('00000000-0000-0000-0000-000000000004','Client','member',true);
insert into gcal_connections(id,user_id,encrypted_access_token,encrypted_refresh_token) values
('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001','synthetic','synthetic'),
('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000002','synthetic','synthetic');
insert into pt_sessions(id,coach_id,member_id,scheduled_at,duration_minutes,status) values
('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000004','2090-09-29T02:00:00Z',60,'scheduled');
insert into gcal_event_map(connection_id,local_entity_key,google_event_id,pt_baseline)
select '00000000-0000-0000-0000-000000000012','pt:'||id,'event',jsonb_build_object('scheduled_at',scheduled_at,'duration_minutes',duration_minutes,'coach_id',coach_id,'member_id',member_id,'status',status,'edited_at',edited_at) from pt_sessions;

set role service_role;
do $$ declare b jsonb; result text;
begin
select pt_baseline into b from gcal_event_map where google_event_id='event';
result := apply_gcal_pt_change('00000000-0000-0000-0000-000000000012','event',b,'2090-09-29T03:00:00Z',60,false);
assert result='applied', result;
assert (select scheduled_at='2090-09-29T03:00:00Z' from pt_sessions limit 1);
result := apply_gcal_pt_change('00000000-0000-0000-0000-000000000012','event',b,'2090-09-29T04:00:00Z',60,false);
assert result='baseline_changed', result;
assert (select count(*)=1 from gcal_pt_changes);

-- Reassigned PT must not be changed by the former coach.
update pt_sessions set coach_id='00000000-0000-0000-0000-000000000003';
update gcal_event_map set pt_baseline=b where google_event_id='event';
result := apply_gcal_pt_change('00000000-0000-0000-0000-000000000012','event',b,null,null,true);
assert result='forbidden', result;
update pt_sessions set coach_id='00000000-0000-0000-0000-000000000002';
result := apply_gcal_pt_change('00000000-0000-0000-0000-000000000012','event',b,null,null,true);
assert result='conflict', result;

-- Approved morning leave rejects PT crossing 18:30, permits exact 18:30.
insert into leaves(coach_id,status,leave_date,leave_end_date,is_half_day,half_day_period)
values('00000000-0000-0000-0000-000000000002','approved','2090-09-29','2090-09-30',true,'morning');
select jsonb_build_object('scheduled_at',scheduled_at,'duration_minutes',duration_minutes,'coach_id',coach_id,'member_id',member_id,'status',status,'edited_at',edited_at) into b from pt_sessions limit 1;
update gcal_event_map set pt_baseline=b where google_event_id='event';
result := apply_gcal_pt_change('00000000-0000-0000-0000-000000000012','event',b,'2090-09-30T10:00:00Z',60,false);
assert result='leave_conflict', result;
result := apply_gcal_pt_change('00000000-0000-0000-0000-000000000012','event',b,'2090-09-30T10:30:00Z',60,false);
assert result='applied', result;
select jsonb_build_object('scheduled_at',scheduled_at,'duration_minutes',duration_minutes,'coach_id',coach_id,'member_id',member_id,'status',status,'edited_at',edited_at) into b from pt_sessions limit 1;
update gcal_event_map set pt_baseline=b where google_event_id='event';
result := apply_gcal_pt_change('00000000-0000-0000-0000-000000000012','event',b,null,null,true);
assert result='applied', result;
assert (select status='cancelled' from pt_sessions limit 1);
end $$;

insert into gcal_pt_drafts(id,connection_id,google_event_id,summary,scheduled_at,duration_minutes)
values('00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000012','draft-event','PT client','2090-10-01T02:00:00Z',60);
do $$ declare first_id uuid; second_id uuid;
begin
begin
perform complete_gcal_pt_draft('00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000002');
raise exception 'Coach draft completion was allowed';
exception when insufficient_privilege then null; end;
update gcal_pt_drafts set scheduled_at='2090-09-30T10:00:00Z' where id='00000000-0000-0000-0000-000000000031';
begin
perform complete_gcal_pt_draft('00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000002');
raise exception 'Draft leave conflict was allowed';
exception when others then assert sqlerrm = 'Coach is on approved leave at this time', sqlerrm; end;
assert (select count(*)=1 from pt_sessions);
update gcal_pt_drafts set scheduled_at='2090-10-01T02:00:00Z' where id='00000000-0000-0000-0000-000000000031';
first_id := complete_gcal_pt_draft('00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000002');
second_id := complete_gcal_pt_draft('00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000002');
assert first_id=second_id;
assert (select count(*)=1 from gcal_event_map where google_event_id='draft-event');
assert (select count(*)=2 from pt_sessions);
end $$;

insert into classes(id,is_active,start_time,end_time) values('00000000-0000-0000-0000-000000000041',true,'12:15','13:15');
select assign_gcal_class_coaches('00000000-0000-0000-0000-000000000041','00000000-0000-0000-0000-000000000001',array['00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003']::uuid[]);
do $$ begin
assert (select count(*)=2 from class_coaches);
assert (select start_time='12:15' and end_time='13:15' from classes limit 1);
update classes set day_of_week=lower(trim(to_char(date '2090-09-30','Day')));
begin
perform assign_gcal_class_coaches('00000000-0000-0000-0000-000000000041','00000000-0000-0000-0000-000000000001',array['00000000-0000-0000-0000-000000000002']::uuid[]);
raise exception 'Class leave conflict was allowed';
exception when others then assert sqlerrm like '%is on approved leave on%', sqlerrm; end;
assert (select count(*)=2 from class_coaches), 'Rejected assignment changed roster';
end $$;
reset role;
do $$ begin
assert not has_table_privilege('anon','gcal_pt_drafts','select');
assert not has_table_privilege('authenticated','gcal_pt_drafts','insert');
assert not has_function_privilege('authenticated','complete_gcal_pt_draft(uuid,uuid,uuid,uuid)','execute');
assert not has_function_privilege('anon','apply_gcal_pt_change(uuid,text,jsonb,timestamptz,integer,boolean)','execute');
end $$;
select 'Google phone PT database checks passed' as result;
