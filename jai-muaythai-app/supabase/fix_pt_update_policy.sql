-- FIX: PT Session UPDATE Policy
-- PROBLEM: Admin can't cancel PT sessions from Overview screen
-- ISSUE: UPDATE policy missing WITH CHECK clause

-- Drop existing UPDATE policy
DROP POLICY IF EXISTS "Admins and coaches can update PT sessions" ON pt_sessions;

-- Recreate with both USING and WITH CHECK clauses
CREATE POLICY "Admins and coaches can update PT sessions"
ON pt_sessions
FOR UPDATE
TO authenticated
USING (
  -- Which rows can be updated
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'master_admin')
  )
  OR
  coach_id = auth.uid()
)
WITH CHECK (
  -- What values can be set (same as USING for this case)
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'master_admin')
  )
  OR
  coach_id = auth.uid()
);

-- Verify the policy was created
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'pt_sessions'
AND cmd = 'UPDATE';
