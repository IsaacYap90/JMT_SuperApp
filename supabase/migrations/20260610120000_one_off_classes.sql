-- One-off classes (e.g. corporate events): occur once on event_date instead of
-- recurring weekly. day_of_week becomes nullable — one-off rows leave it NULL so
-- every recurring-timetable consumer (booking, trials, calendly) naturally
-- ignores them without code changes.
alter table public.classes
  add column if not exists event_date date,
  add column if not exists class_kind text not null default 'regular';

alter table public.classes
  alter column day_of_week drop not null;

do $$ begin
  alter table public.classes
    add constraint classes_kind_check check (class_kind in ('regular', 'corporate'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.classes
    add constraint classes_schedule_check check (event_date is not null or day_of_week is not null);
exception when duplicate_object then null; end $$;
