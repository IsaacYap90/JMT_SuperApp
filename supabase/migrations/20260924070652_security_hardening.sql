-- Applied as migration 20260924070652 after review.

-- Trigger functions never need to be callable through the PostgREST RPC API.
-- They still execute normally when their table trigger fires.
revoke execute on function public.notify_coach_on_class_assignment() from public, anon, authenticated;
revoke execute on function public.notify_lead_coach_assignment() from public, anon, authenticated;

-- This trigger function has no dynamic SQL, but a pinned search path protects
-- it from future object-shadowing and clears the Supabase security warning.
alter function public.firstreply_invoice_status_forward() set search_path = public, pg_temp;
