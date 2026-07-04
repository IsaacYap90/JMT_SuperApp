-- Ensure a class can have at most one class_sessions override per date.
-- Makes the Telegram bot's class-cancel atomic: a concurrent tap / Vercel retry
-- hits a unique violation (handled gracefully in code) instead of inserting a
-- duplicate cancelled row + double-notifying coaches.
-- Idempotent: de-dupes any existing duplicates first, then adds the constraint.

-- Collapse existing duplicates (keep the earliest row per class_id+session_date).
DELETE FROM public.class_sessions a
USING public.class_sessions b
WHERE a.class_id = b.class_id
  AND a.session_date = b.session_date
  AND a.ctid > b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS class_sessions_class_date_uidx
  ON public.class_sessions (class_id, session_date);
