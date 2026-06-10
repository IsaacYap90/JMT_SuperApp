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

-- The class_coaches notification trigger concatenates day_of_week into the
-- message; with one-off classes day_of_week is NULL and `||` nulls the whole
-- string, violating notifications.message NOT NULL. Use the event date as the
-- label for one-off classes.
create or replace function public.notify_coach_on_class_assignment()
returns trigger
language plpgsql
as $function$
DECLARE
  class_name TEXT;
  class_day TEXT;
  class_time TEXT;
BEGIN
  SELECT name,
         COALESCE(INITCAP(day_of_week), to_char(event_date, 'FMDay, DD Mon YYYY')),
         start_time::TEXT
  INTO class_name, class_day, class_time
  FROM classes WHERE id = NEW.class_id;

  PERFORM create_notification(
    NEW.coach_id,
    'New Class Assignment',
    'You have been assigned to ' || class_name || ' on ' || class_day || ' at ' || class_time,
    'system',
    NULL,
    NULL,
    NEW.class_id,
    'class'
  );

  RETURN NEW;
END;
$function$;
