-- Additive customer identity foundation. This migration creates empty tables
-- only: no existing lead, trial, or JAI row is backfilled or linked.

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_identifiers (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  kind text not null check (kind in ('phone', 'email')),
  normalized_value text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (kind, normalized_value),
  unique (customer_id, kind, normalized_value)
);

create table if not exists public.customer_source_links (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  source_schema text not null,
  source_table text not null,
  source_key text not null,
  linked_via text not null check (linked_via in ('phone', 'email', 'manual')),
  linked_identifier_id uuid references public.customer_identifiers(id) on delete set null,
  linked_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (
    (source_schema = 'public' and source_table in ('leads', 'trial_bookings'))
    or (source_schema = 'jai' and source_table = 'leads')
  ),
  unique (source_schema, source_table, source_key)
);

create index if not exists customer_identifiers_customer_idx
  on public.customer_identifiers (customer_id);
create index if not exists customer_source_links_customer_idx
  on public.customer_source_links (customer_id);

-- Service-role only. With RLS enabled and no anon/authenticated policies,
-- browser clients cannot inspect or mutate the identity graph.
alter table public.customers enable row level security;
alter table public.customer_identifiers enable row level security;
alter table public.customer_source_links enable row level security;
revoke all on public.customers from anon, authenticated;
revoke all on public.customer_identifiers from anon, authenticated;
revoke all on public.customer_source_links from anon, authenticated;
grant all on public.customers to service_role;
grant all on public.customer_identifiers to service_role;
grant all on public.customer_source_links to service_role;
