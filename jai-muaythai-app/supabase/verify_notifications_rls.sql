-- ================================================
-- VERIFY NOTIFICATIONS RLS POLICIES
-- Check if admin can update their own notifications
-- ================================================

-- 1. Check existing UPDATE policies on notifications table
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'notifications'
AND cmd = 'UPDATE'
ORDER BY policyname;

-- 2. If no UPDATE policy exists, create one
-- This allows users to update their own notifications (mark as read)
DO $$
BEGIN
  -- Drop existing policy if it exists (to avoid conflicts)
  DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;

  -- Create new policy
  CREATE POLICY "Users can update own notifications" ON notifications
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

  RAISE NOTICE 'Policy created: Users can update own notifications';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Policy may already exist or error occurred: %', SQLERRM;
END $$;

-- 3. Verify the policy was created
SELECT
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'notifications'
AND cmd = 'UPDATE';

-- 4. Test query (this is what the app runs)
-- Should return the notifications that can be updated
SELECT
  id,
  title,
  is_read,
  user_id
FROM notifications
WHERE user_id = auth.uid()
AND is_read = false
LIMIT 5;
