-- Additive observability for JAI handoffs. ai_paused remains the behaviour
-- switch; these nullable fields explain who/why/when without changing legacy
-- rows. The application keeps a legacy-column fallback during rollout.
alter table jai.leads
  add column if not exists ai_paused_at timestamptz,
  add column if not exists ai_paused_by text,
  add column if not exists ai_pause_source text,
  add column if not exists ai_pause_reason text,
  add column if not exists ai_pause_expires_at timestamptz;

comment on column jai.leads.ai_paused_at is
  'When the current JAI pause began; null on legacy pause rows.';
comment on column jai.leads.ai_paused_by is
  'Actor key that set the pause, e.g. coach_jeremy or jai.';
comment on column jai.leads.ai_pause_source is
  'Stable machine source for the pause, e.g. inbox_manual or join_intent.';
comment on column jai.leads.ai_pause_reason is
  'Short human-readable reason shown in the WA inbox.';
comment on column jai.leads.ai_pause_expires_at is
  'Earliest 24h auto-resume check; a later human reply can extend ownership.';

