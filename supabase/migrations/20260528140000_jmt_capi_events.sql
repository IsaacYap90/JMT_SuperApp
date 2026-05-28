-- jmt_capi_events: log + idempotency for Meta Conversions API ("Conversion
-- Leads") feedback events sent from JMT lead status changes. Mirrors Lead OS's
-- leados_capi_events, single-tenant (no tenant_id).
-- One row per (lead_id, event_name) — the unique index enforces idempotency.

create table if not exists public.jmt_capi_events (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null,
  meta_lead_id  text not null,
  event_name    text not null,
  ok            boolean not null default false,
  http_status   integer,
  error         text,
  response      jsonb,
  created_at    timestamptz not null default now()
);

create unique index if not exists jmt_capi_events_lead_event_uniq
  on public.jmt_capi_events (lead_id, event_name);

create index if not exists jmt_capi_events_lead_id_idx
  on public.jmt_capi_events (lead_id);

-- Server-only table (written via service-role admin client). Enable RLS with no
-- public policies so anon/authenticated clients can't read or write it.
alter table public.jmt_capi_events enable row level security;
