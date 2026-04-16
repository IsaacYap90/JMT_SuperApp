-- =============================================
-- JMT OS Audit Log
-- Run this in Supabase SQL Editor (one-time setup)
-- =============================================

-- 1. Create audit_log table
CREATE TABLE IF NOT EXISTS public.audit_log (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name    text NOT NULL,
  operation     text NOT NULL,          -- INSERT, UPDATE, DELETE
  user_id       uuid,                   -- who did it (auth.uid())
  record_id     uuid,                   -- which row was affected
  old_data      jsonb,                  -- row before change (null for INSERT)
  new_data      jsonb,                  -- row after change (null for DELETE)
  created_at    timestamptz DEFAULT now()
);

-- 2. Create the trigger function (fires on every change)
CREATE OR REPLACE FUNCTION public.audit_trigger_func()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_log (
    table_name,
    operation,
    user_id,
    record_id,
    old_data,
    new_data
  )
  VALUES (
    TG_TABLE_NAME,
    TG_OP,
    auth.uid(),
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
  );
  RETURN NEW;
END;
$$;

-- 3. Attach triggers to key tables
CREATE TRIGGER audit_pt_sessions
  AFTER INSERT OR UPDATE OR DELETE ON public.pt_sessions
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_trial_bookings
  AFTER INSERT OR UPDATE OR DELETE ON public.trial_bookings
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_leads
  AFTER INSERT OR UPDATE OR DELETE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_users
  AFTER INSERT OR UPDATE OR DELETE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- 4. RLS: only master_admin can read; no one writes directly
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "master_admin_read_audit"
  ON public.audit_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND role = 'master_admin'
    )
  );
