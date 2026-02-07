-- FIX: Admin RLS Policies
-- PROBLEM: Admins cannot see PT sessions from other coaches due to RLS restrictions
-- SOLUTION: Create policies that allow admins to view ALL data

-- ============================================
-- 1. DROP EXISTING RESTRICTIVE POLICIES
-- ============================================

-- Drop existing PT session policies (if they exist)
DROP POLICY IF EXISTS "Users can view own PT sessions" ON pt_sessions;
DROP POLICY IF EXISTS "Coaches can view own PT sessions" ON pt_sessions;
DROP POLICY IF EXISTS "Members can view own PT sessions" ON pt_sessions;
DROP POLICY IF EXISTS "Admins can view all PT sessions" ON pt_sessions;

-- ============================================
-- 2. CREATE NEW PT SESSION RLS POLICIES
-- ============================================

-- Policy 1: Admins can view ALL PT sessions
CREATE POLICY "Admins can view all PT sessions"
ON pt_sessions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'master_admin')
  )
);

-- Policy 2: Coaches can view their own PT sessions
CREATE POLICY "Coaches can view own PT sessions"
ON pt_sessions
FOR SELECT
TO authenticated
USING (
  coach_id = auth.uid()
  OR
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'master_admin')
  )
);

-- Policy 3: Members can view their own PT sessions
CREATE POLICY "Members can view own PT sessions"
ON pt_sessions
FOR SELECT
TO authenticated
USING (
  member_id = auth.uid()
  OR
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'master_admin')
  )
);

-- Policy 4: Admins can INSERT PT sessions for any coach
CREATE POLICY "Admins can create PT sessions"
ON pt_sessions
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'master_admin')
  )
  OR
  coach_id = auth.uid()
);

-- Policy 5: Admins can UPDATE any PT sessions, coaches can update own
CREATE POLICY "Admins and coaches can update PT sessions"
ON pt_sessions
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'master_admin')
  )
  OR
  coach_id = auth.uid()
);

-- Policy 6: Admins can DELETE PT sessions
CREATE POLICY "Admins can delete PT sessions"
ON pt_sessions
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'master_admin')
  )
);

-- ============================================
-- 3. ENSURE RLS IS ENABLED
-- ============================================

ALTER TABLE pt_sessions ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 4. FIX OTHER ADMIN-RELATED TABLES
-- ============================================

-- Classes: Admins can view/edit all classes
DROP POLICY IF EXISTS "Admins can view all classes" ON classes;
CREATE POLICY "Admins can view all classes"
ON classes
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'master_admin', 'coach')
  )
);

DROP POLICY IF EXISTS "Admins can manage classes" ON classes;
CREATE POLICY "Admins can manage classes"
ON classes
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'master_admin')
  )
);

-- Users: Admins can view all users
DROP POLICY IF EXISTS "Admins can view all users" ON users;
CREATE POLICY "Admins can view all users"
ON users
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR
  EXISTS (
    SELECT 1 FROM users AS u
    WHERE u.id = auth.uid()
    AND u.role IN ('admin', 'master_admin')
  )
);

DROP POLICY IF EXISTS "Admins can update all users" ON users;
CREATE POLICY "Admins can update all users"
ON users
FOR UPDATE
TO authenticated
USING (
  id = auth.uid()
  OR
  EXISTS (
    SELECT 1 FROM users AS u
    WHERE u.id = auth.uid()
    AND u.role IN ('admin', 'master_admin')
  )
);

-- Notifications: Admins can view all notifications
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
CREATE POLICY "Users can view notifications"
ON notifications
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'master_admin')
  )
);

-- ============================================
-- 5. PT PACKAGES - Admins can see all
-- ============================================

DROP POLICY IF EXISTS "Admins can view all PT packages" ON pt_packages;
CREATE POLICY "Admins can view all PT packages"
ON pt_packages
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR
  preferred_coach_id = auth.uid()
  OR
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'master_admin')
  )
);

DROP POLICY IF EXISTS "Admins can manage PT packages" ON pt_packages;
CREATE POLICY "Admins can manage PT packages"
ON pt_packages
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'master_admin')
  )
);

-- ============================================
-- 6. VERIFICATION QUERY
-- ============================================

-- Test query: Check if admin can now see all PT sessions
-- Run this as Jeremy to verify:
-- SELECT
--   id,
--   scheduled_at,
--   coach_id,
--   member_id,
--   status
-- FROM pt_sessions
-- ORDER BY scheduled_at DESC
-- LIMIT 10;

-- ============================================
-- 7. NOTES
-- ============================================

-- SECURITY MODEL:
-- - Admins (admin, master_admin): Can view/edit ALL data
-- - Coaches: Can view/edit ONLY their own PT sessions
-- - Members: Can view ONLY their own PT sessions
--
-- If Jeremy still can't see PT sessions after running this:
-- 1. Check if RLS is enabled: SELECT * FROM pg_policies WHERE tablename = 'pt_sessions';
-- 2. Check Jeremy's role: SELECT id, email, role FROM users WHERE email = 'jeremy@jmt.com';
-- 3. Check if PT sessions exist: SELECT COUNT(*) FROM pt_sessions;
-- 4. Try disabling RLS temporarily: ALTER TABLE pt_sessions DISABLE ROW LEVEL SECURITY;
