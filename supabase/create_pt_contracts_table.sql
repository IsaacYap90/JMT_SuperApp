-- Digital PT contract signing — stores the signed contract alongside the
-- pt_package it belongs to. Each package has at most one signed contract.
--
-- Snapshot fields (client_name_snapshot, price_per_session, etc.) freeze the
-- values at sign time — later edits to pt_packages/users should not change
-- what the signed PDF said. Signature PNGs and PDF live in private Storage
-- buckets (pt-signatures, pt-contracts).
--
-- Apply once in Supabase SQL editor. Idempotent.

alter table public.pt_packages
  add column if not exists is_kid boolean not null default false,
  add column if not exists kid_name text,
  add column if not exists kid_age integer;

create table if not exists public.pt_contracts (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null unique references public.pt_packages(id) on delete cascade,

  -- frozen snapshot of who signed and what they signed for
  client_user_id uuid references public.users(id),
  client_name_snapshot text not null,
  client_nric_last4 text,              -- last 4 of NRIC only, privacy
  is_kid boolean not null default false,
  kid_name text,
  kid_age integer,
  guardian_name text,                   -- signer's name when is_kid
  guardian_phone text,

  coach_name_snapshot text not null,
  total_sessions integer not null,
  price_per_session numeric not null,
  total_price numeric not null,
  payment_method text,
  expiry_date date,

  -- storage paths (private buckets, fetch via signed URLs)
  client_signature_path text not null,
  jmt_signature_path text not null,
  pdf_path text not null,
  pdf_sha256 text not null,

  signed_at_client timestamptz not null default now(),
  signed_at_jmt timestamptz not null default now(),
  terms_version text not null default 'v1-2026-04-14',
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create index if not exists pt_contracts_package_id_idx on public.pt_contracts(package_id);
create index if not exists pt_contracts_client_user_id_idx on public.pt_contracts(client_user_id);

alter table public.pt_contracts enable row level security;

drop policy if exists "Admins can view contracts" on public.pt_contracts;
create policy "Admins can view contracts"
  on public.pt_contracts for select
  using (
    exists (
      select 1 from public.users
      where id = auth.uid()
        and role in ('admin', 'master_admin')
    )
  );

drop policy if exists "Admins can insert contracts" on public.pt_contracts;
create policy "Admins can insert contracts"
  on public.pt_contracts for insert
  with check (
    exists (
      select 1 from public.users
      where id = auth.uid()
        and role in ('admin', 'master_admin')
    )
  );

-- Private buckets for signatures + PDFs (create via Supabase dashboard or
-- the following. Server action uses service role key so it bypasses RLS).
insert into storage.buckets (id, name, public)
values ('pt-signatures', 'pt-signatures', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('pt-contracts', 'pt-contracts', false)
on conflict (id) do nothing;
