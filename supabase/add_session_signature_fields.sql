-- Session-level client signature for the attendance record.
-- Captured when the coach (or Jeremy) marks a session completed:
-- either the client signs on the device (client_signature data URL) or
-- signed_on_paper flags that we still collect a paper signature offline.
--
-- Apply once in Supabase SQL editor. Idempotent.

alter table public.pt_sessions
  add column if not exists signed_on_paper boolean not null default false,
  add column if not exists client_signature text,
  add column if not exists signed_at timestamptz,
  add column if not exists signed_by uuid references public.users(id);
