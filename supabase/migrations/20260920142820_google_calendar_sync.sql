-- Google Calendar mirror: stores coach OAuth connections and event sync mappings.
-- UNAPPLIED — apply manually after review.

-- Coach Google Calendar connections (one per coach).
-- Tokens are AES-256-GCM encrypted at rest by the app layer before INSERT.
create table if not exists public.gcal_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  -- The Google secondary calendar ID (created by the app, not the primary)
  google_calendar_id text,
  -- AES-256-GCM encrypted JSON blobs (app encrypts before write)
  encrypted_access_token text not null,
  encrypted_refresh_token text not null,
  -- Token metadata (unencrypted, needed for refresh-before-expiry)
  token_expires_at timestamptz,
  google_email text,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  -- Soft disconnect: revoked_at != null means the coach disconnected.
  -- We keep the row so the secondary calendar + events remain on Google untouched.
  revoked_at timestamptz,
  constraint gcal_connections_user_unique unique (user_id)
);

-- Idempotent event mapping / outbox: one row per (connection, local entity).
-- Ensures retry-safe upserts: if a sync crashes mid-way, the next run picks up
-- where it left off by comparing local_updated_at vs synced_at.
create table if not exists public.gcal_event_map (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.gcal_connections(id) on delete cascade,
  -- "class:{class_id}", "pt:{pt_session_id}", "leave:{leave_id}" etc.
  local_entity_key text not null,
  -- Google Calendar event ID returned on creation
  google_event_id text,
  -- Track staleness: when the local entity was last modified vs when we last synced it
  local_updated_at timestamptz,
  synced_at timestamptz,
  -- If the entity was deleted/cancelled locally, mark for removal from Google
  deleted boolean not null default false,
  constraint gcal_event_map_unique unique (connection_id, local_entity_key)
);

-- The app's server actions return a safe connection status to the coach. Never
-- expose token ciphertext through the Data API: a signed-in client does not need
-- direct access to either internal table.
alter table public.gcal_connections enable row level security;
alter table public.gcal_event_map enable row level security;

revoke all on table public.gcal_connections from public, anon, authenticated;
revoke all on table public.gcal_event_map from public, anon, authenticated;
grant select, insert, update, delete on table public.gcal_connections to service_role;
grant select, insert, update, delete on table public.gcal_event_map to service_role;

-- Index for cron sync queries
create index if not exists gcal_connections_active_idx
  on public.gcal_connections (user_id)
  where revoked_at is null;

create index if not exists gcal_event_map_stale_idx
  on public.gcal_event_map (connection_id, synced_at)
  where deleted = false;
