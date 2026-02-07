-- Calendar Subscription Schema
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. ADD CALENDAR TOKEN COLUMN TO USERS
-- ============================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS calendar_token UUID DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_calendar_token ON users(calendar_token) WHERE calendar_token IS NOT NULL;

-- ============================================
-- 2. FUNCTION TO GENERATE NEW CALENDAR TOKEN
-- ============================================

CREATE OR REPLACE FUNCTION generate_calendar_token(user_uuid uuid)
RETURNS uuid AS $$
BEGIN
  UPDATE users
  SET calendar_token = gen_random_uuid()
  WHERE id = user_uuid;

  SELECT calendar_token INTO STRICT
  FROM users
  WHERE id = user_uuid;

  RETURN (SELECT calendar_token FROM users WHERE id = user_uuid);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 3. FUNCTION TO GET CALENDAR TOKEN
-- ============================================

CREATE OR REPLACE FUNCTION get_calendar_token(user_uuid uuid)
RETURNS uuid AS $$
  SELECT calendar_token FROM users WHERE id = user_uuid;
$$ LANGUAGE sql SECURITY DEFINER;

-- ============================================
-- 4. VIEW FOR COACH SCHEDULE (for iCal)
-- ============================================

DROP VIEW IF EXISTS coach_schedule_view;

CREATE OR REPLACE VIEW coach_schedule_view AS
SELECT
  c.id as class_id,
  c.name as class_name,
  c.description,
  c.day_of_week,
  c.start_time,
  c.end_time,
  c.location,
  c.lead_coach_id,
  u.full_name as coach_name,
  'class' as event_type,
  NULL as scheduled_at,
  NULL as member_name,
  NULL as session_type,
  NULL as commission_amount
FROM classes c
JOIN users u ON c.lead_coach_id = u.id
WHERE c.is_active = true

UNION ALL

SELECT
  ps.id as class_id,
  ps.session_type as class_name,
  'PT Session' as description,
  NULL as day_of_week,
  NULL as start_time,
  NULL as end_time,
  NULL as location,
  ps.coach_id as lead_coach_id,
  u.full_name as coach_name,
  'pt' as event_type,
  ps.scheduled_at,
  m.full_name as member_name,
  ps.session_type,
  ps.commission_amount
FROM pt_sessions ps
JOIN users u ON ps.coach_id = u.id
JOIN users m ON ps.member_id = m.id
WHERE ps.status = 'scheduled'
  AND ps.cancelled_at IS NULL
  AND ps.scheduled_at >= now();
