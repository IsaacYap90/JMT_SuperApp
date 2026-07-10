-- Add half_day_period to leaves so a half-day can be MORNING or EVENING.
-- morning = off before 6:30pm, teaching evening (the original/legacy behaviour)
-- evening = teach earlier classes, off from 6:30pm
-- Nullable: null = full day, OR legacy half-day (treated as 'morning' for back-compat).
-- is_half_day stays as the flag for "is this a half day at all".
ALTER TABLE leaves
  ADD COLUMN IF NOT EXISTS half_day_period TEXT
    CHECK (half_day_period IN ('morning', 'evening'));
