-- Adds guardian (payer) fields to pt_packages so we can model the
-- "parent pays, child trains" case: pt_packages.user_id still points at
-- the trainee (e.g. Danish), while guardian_name/guardian_phone hold the
-- payer's contact (e.g. Nisha). Optional — left null for the normal
-- adult-signs-own-contract case.
--
-- Apply once in Supabase SQL editor. Idempotent.

alter table public.pt_packages
  add column if not exists guardian_name text,
  add column if not exists guardian_phone text;
