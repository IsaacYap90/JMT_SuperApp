alter table public.pt_sessions
  add column if not exists signed_on_paper boolean not null default false,
  add column if not exists client_signature text,
  add column if not exists signed_at timestamptz,
  add column if not exists signed_by uuid references public.users(id);
