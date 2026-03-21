-- Fix leaves table: change FK references from auth.users to public.users
-- This is needed so Supabase PostgREST joins (e.g. users!leaves_coach_id_fkey(*)) work correctly.

-- Drop old foreign keys (pointing to auth.users)
ALTER TABLE leaves DROP CONSTRAINT IF EXISTS leaves_coach_id_fkey;
ALTER TABLE leaves DROP CONSTRAINT IF EXISTS leaves_reviewed_by_fkey;

-- Add new foreign keys pointing to public.users
ALTER TABLE leaves
  ADD CONSTRAINT leaves_coach_id_fkey
  FOREIGN KEY (coach_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE leaves
  ADD CONSTRAINT leaves_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES public.users(id);
