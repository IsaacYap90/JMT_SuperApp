-- RESTORE CANCELLED PT SESSIONS FOR TESTING
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. VIEW ALL CANCELLED PT SESSIONS
-- ============================================

SELECT
  ps.id,
  ps.scheduled_at,
  ps.duration_minutes,
  ps.session_type,
  ps.commission_amount,
  ps.status,
  ps.cancelled_at,
  ps.cancelled_by,
  coach.full_name as coach_name,
  coach.email as coach_email,
  member.full_name as member_name,
  member.email as member_email,
  canceller.full_name as cancelled_by_name
FROM pt_sessions ps
LEFT JOIN users coach ON ps.coach_id = coach.id
LEFT JOIN users member ON ps.member_id = member.id
LEFT JOIN users canceller ON ps.cancelled_by = canceller.id
WHERE ps.status = 'cancelled'
ORDER BY ps.scheduled_at DESC;

-- ============================================
-- 2. COUNT CANCELLED SESSIONS BY COACH
-- ============================================

SELECT
  coach.full_name as coach_name,
  COUNT(*) as cancelled_count
FROM pt_sessions ps
LEFT JOIN users coach ON ps.coach_id = coach.id
WHERE ps.status = 'cancelled'
GROUP BY coach.full_name
ORDER BY cancelled_count DESC;

-- ============================================
-- 3. RESTORE ALL CANCELLED PT SESSIONS
-- ============================================
-- CAUTION: This will restore ALL cancelled PT sessions to 'scheduled' status

-- Uncomment to run:
/*
UPDATE pt_sessions
SET
  status = 'scheduled',
  cancelled_at = NULL,
  cancelled_by = NULL
WHERE status = 'cancelled'
RETURNING
  id,
  scheduled_at,
  (SELECT full_name FROM users WHERE id = coach_id) as coach_name,
  (SELECT full_name FROM users WHERE id = member_id) as member_name;
*/

-- ============================================
-- 4. RESTORE SPECIFIC PT SESSION BY ID
-- ============================================
-- Replace <session_id> with actual PT session ID

-- Uncomment and replace <session_id> to run:
/*
UPDATE pt_sessions
SET
  status = 'scheduled',
  cancelled_at = NULL,
  cancelled_by = NULL
WHERE id = '<session_id>'
RETURNING
  id,
  scheduled_at,
  (SELECT full_name FROM users WHERE id = coach_id) as coach_name,
  (SELECT full_name FROM users WHERE id = member_id) as member_name;
*/

-- ============================================
-- 5. RESTORE CANCELLED SESSIONS FOR SPECIFIC COACH
-- ============================================
-- Replace <coach_email> with actual coach email

-- Uncomment and replace <coach_email> to run:
/*
UPDATE pt_sessions
SET
  status = 'scheduled',
  cancelled_at = NULL,
  cancelled_by = NULL
WHERE status = 'cancelled'
AND coach_id = (SELECT id FROM users WHERE email = '<coach_email>')
RETURNING
  id,
  scheduled_at,
  (SELECT full_name FROM users WHERE id = coach_id) as coach_name,
  (SELECT full_name FROM users WHERE id = member_id) as member_name;
*/

-- ============================================
-- 6. RESTORE RECENT CANCELLED SESSIONS (LAST 7 DAYS)
-- ============================================

-- Uncomment to run:
/*
UPDATE pt_sessions
SET
  status = 'scheduled',
  cancelled_at = NULL,
  cancelled_by = NULL
WHERE status = 'cancelled'
AND cancelled_at >= NOW() - INTERVAL '7 days'
RETURNING
  id,
  scheduled_at,
  cancelled_at as was_cancelled_at,
  (SELECT full_name FROM users WHERE id = coach_id) as coach_name,
  (SELECT full_name FROM users WHERE id = member_id) as member_name;
*/

-- ============================================
-- 7. RESTORE UPCOMING CANCELLED SESSIONS ONLY
-- ============================================
-- Only restore sessions scheduled in the future

-- Uncomment to run:
/*
UPDATE pt_sessions
SET
  status = 'scheduled',
  cancelled_at = NULL,
  cancelled_by = NULL
WHERE status = 'cancelled'
AND scheduled_at > NOW()
RETURNING
  id,
  scheduled_at,
  (SELECT full_name FROM users WHERE id = coach_id) as coach_name,
  (SELECT full_name FROM users WHERE id = member_id) as member_name;
*/

-- ============================================
-- 8. VIEW CANCELLED SESSIONS GROUPED BY DATE
-- ============================================

SELECT
  DATE(ps.scheduled_at) as session_date,
  COUNT(*) as cancelled_count,
  STRING_AGG(
    coach.full_name || ' with ' || member.full_name,
    ', '
  ) as sessions
FROM pt_sessions ps
LEFT JOIN users coach ON ps.coach_id = coach.id
LEFT JOIN users member ON ps.member_id = member.id
WHERE ps.status = 'cancelled'
GROUP BY DATE(ps.scheduled_at)
ORDER BY session_date DESC;

-- ============================================
-- USAGE INSTRUCTIONS
-- ============================================

-- STEP 1: Run query #1 to see all cancelled PT sessions
-- STEP 2: Choose one of the restore options (#3-7) based on your needs
-- STEP 3: Uncomment the chosen UPDATE query
-- STEP 4: Replace any placeholder values (like <session_id>)
-- STEP 5: Run the UPDATE query
-- STEP 6: Verify the results with query #1 again

-- ============================================
-- NOTES
-- ============================================

-- - All UPDATE queries include RETURNING clause to show what was restored
-- - You can filter by coach, date, or specific session ID
-- - Restoring sets: status='scheduled', cancelled_at=NULL, cancelled_by=NULL
-- - Past sessions will show in coach's schedule but marked as "passed"
-- - Future sessions will appear as normal scheduled sessions
