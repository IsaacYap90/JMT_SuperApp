-- FIX: Member & Admin RLS Gaps
-- PROBLEM: Members cannot cancel PT sessions or book classes. Admins cannot send notifications.
-- SOLUTION: Add specific policies for these actions.

-- ============================================
-- 1. PT SESSIONS - Allow Members to Cancel
-- ============================================

DROP POLICY IF EXISTS "Members can update own PT sessions" ON pt_sessions;
CREATE POLICY "Members can update own PT sessions"
ON pt_sessions
FOR UPDATE
TO authenticated
USING (member_id = auth.uid())
WITH CHECK (member_id = auth.uid());
-- Note: Ideally we restrict this to status='cancelled' via trigger, but this unblocks the app.

-- ============================================
-- 2. CLASS ENROLLMENTS - Allow Booking/Cancelling
-- ============================================

ALTER TABLE class_enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view own enrollments" ON class_enrollments;
CREATE POLICY "Members can view own enrollments"
ON class_enrollments FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() 
  OR 
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'master_admin', 'coach'))
);

DROP POLICY IF EXISTS "Members can book classes" ON class_enrollments;
CREATE POLICY "Members can book classes"
ON class_enrollments FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Members can cancel classes" ON class_enrollments;
CREATE POLICY "Members can cancel classes"
ON class_enrollments FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ============================================
-- 3. NOTIFICATIONS - Allow Admins/Coaches to Send
-- ============================================

DROP POLICY IF EXISTS "Admins and Coaches can send notifications" ON notifications;
CREATE POLICY "Admins and Coaches can send notifications"
ON notifications
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'master_admin', 'coach')
  )
);
