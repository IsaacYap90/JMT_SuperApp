-- Add optional free-text member notes to jai.leads. Surfaced to JAI (the JMT AI
-- assistant) as extra context when it recognises a known member, so it can greet
-- them personally. Nullable; existing rows stay null. Read defensively in code —
-- the app tolerates this column being absent.
alter table jai.leads
  add column if not exists member_notes text;
