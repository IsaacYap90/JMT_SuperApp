-- DIAGNOSTIC SCRIPT: PT Session Cancel Issue
-- Run this in Supabase SQL Editor to diagnose the problem

-- ============================================
-- 1. CHECK JEREMY'S USER RECORD
-- ============================================
SELECT
  id,
  email,
  role,
  is_active
FROM users
WHERE email = 'jeremy@jmt.com';

-- Expected result: role should be 'master_admin' or 'admin'

-- ============================================
-- 2. CHECK RLS IS ENABLED ON PT_SESSIONS
-- ============================================
SELECT
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename = 'pt_sessions';

-- Expected result: rowsecurity should be TRUE

-- ============================================
-- 3. CHECK ALL POLICIES ON PT_SESSIONS
-- ============================================
SELECT
  policyname,
  cmd,
  roles,
  CASE
    WHEN qual IS NOT NULL THEN 'Has USING clause'
    ELSE 'No USING clause'
  END as using_clause,
  CASE
    WHEN with_check IS NOT NULL THEN 'Has WITH CHECK clause'
    ELSE 'No WITH CHECK clause'
  END as with_check_clause
FROM pg_policies
WHERE tablename = 'pt_sessions'
ORDER BY cmd, policyname;

-- Expected result: Should see UPDATE policy with both clauses

-- ============================================
-- 4. CHECK IF JEREMY CAN SELECT PT SESSIONS
-- ============================================
-- Run this query while logged in as Jeremy:
/*
SELECT
  id,
  scheduled_at,
  coach_id,
  member_id,
  status,
  cancelled_by,
  cancelled_at
FROM pt_sessions
WHERE status = 'scheduled'
ORDER BY scheduled_at DESC
LIMIT 5;
*/

-- ============================================
-- 5. TEST UPDATE DIRECTLY
-- ============================================
-- Try to update a specific PT session (replace <pt_session_id> with actual ID)
-- Run this while logged in as Jeremy:
/*
UPDATE pt_sessions
SET
  status = 'cancelled',
  cancelled_by = auth.uid(),
  cancelled_at = NOW()
WHERE id = '<pt_session_id>'
RETURNING *;
*/

-- If this fails, check the error message carefully

-- ============================================
-- 6. CHECK TABLE STRUCTURE
-- ============================================
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'pt_sessions'
AND column_name IN ('status', 'cancelled_by', 'cancelled_at')
ORDER BY ordinal_position;

-- Verify these columns exist and have correct types

-- ============================================
-- 7. TEMPORARY DEBUG: DISABLE RLS
-- ============================================
-- ONLY FOR DEBUGGING - DO NOT KEEP THIS IN PRODUCTION
-- If you want to test if RLS is the issue, run:
/*
ALTER TABLE pt_sessions DISABLE ROW LEVEL SECURITY;
-- Now try cancelling from the app
-- Then re-enable:
ALTER TABLE pt_sessions ENABLE ROW LEVEL SECURITY;
*/

-- ============================================
-- 8. CHECK AUTH.UID()
-- ============================================
-- Verify auth.uid() returns Jeremy's ID when logged in as Jeremy:
/*
SELECT
  auth.uid() as current_user_id,
  (SELECT email FROM users WHERE id = auth.uid()) as current_email,
  (SELECT role FROM users WHERE id = auth.uid()) as current_role;
*/
