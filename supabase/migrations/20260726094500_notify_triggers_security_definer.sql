-- Class-assignment notification triggers ran as SECURITY INVOKER, so they called
-- create_notification() as the logged-in user. create_notification is granted to
-- postgres and service_role only, so any admin editing a class in the browser hit
-- "Update failed: permission denied for function create_notification".
--
-- Fixed by running the triggers as their owner, matching the pattern already used
-- by notify_admins_on_leave_request / notify_coach_on_leave_update. Deliberately
-- NOT by granting create_notification to authenticated — that would let any signed-in
-- user write a notification to any other user's feed.

ALTER FUNCTION public.notify_coach_on_class_assignment() SECURITY DEFINER;
ALTER FUNCTION public.notify_coach_on_class_assignment() SET search_path TO 'public', 'pg_temp';

ALTER FUNCTION public.notify_lead_coach_assignment() SECURITY DEFINER;
ALTER FUNCTION public.notify_lead_coach_assignment() SET search_path TO 'public', 'pg_temp';
