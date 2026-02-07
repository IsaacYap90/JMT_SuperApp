-- ================================================
-- LEAVE REQUESTS RLS POLICIES
-- Ensure admin can update leave requests for approval/rejection
-- ================================================

-- 1. Check existing UPDATE policies on leave_requests table
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
WHERE tablename = 'leave_requests'
AND cmd = 'UPDATE'
ORDER BY policyname;

-- 2. Create UPDATE policy for admins if it doesn't exist
DO $$
BEGIN
  -- Drop existing admin policy if it exists (to avoid conflicts)
  DROP POLICY IF EXISTS "Admin can update leave requests" ON leave_requests;

  -- Create new policy allowing admin/master_admin to update any leave request
  CREATE POLICY "Admin can update leave requests" ON leave_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'master_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'master_admin')
    )
  );

  RAISE NOTICE 'Policy created: Admin can update leave requests';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Policy may already exist or error occurred: %', SQLERRM;
END $$;

-- 3. Also ensure coaches can update their own leave requests (for cancellation)
DO $$
BEGIN
  DROP POLICY IF EXISTS "Coaches can update own leave requests" ON leave_requests;

  CREATE POLICY "Coaches can update own leave requests" ON leave_requests
  FOR UPDATE
  TO authenticated
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

  RAISE NOTICE 'Policy created: Coaches can update own leave requests';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Policy may already exist or error occurred: %', SQLERRM;
END $$;

-- 4. Verify the policies were created
SELECT
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'leave_requests'
AND cmd = 'UPDATE'
ORDER BY policyname;

-- 5. Check leave_requests table schema
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'leave_requests'
ORDER BY ordinal_position;

-- 6. Verify leave_type column exists (add if missing)
DO $$
BEGIN
  -- Add leave_type column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leave_requests'
    AND column_name = 'leave_type'
  ) THEN
    ALTER TABLE leave_requests ADD COLUMN leave_type TEXT DEFAULT 'annual';
    RAISE NOTICE 'Added leave_type column to leave_requests table';
  ELSE
    RAISE NOTICE 'leave_type column already exists';
  END IF;

  -- Add review_notes column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leave_requests'
    AND column_name = 'review_notes'
  ) THEN
    ALTER TABLE leave_requests ADD COLUMN review_notes TEXT;
    RAISE NOTICE 'Added review_notes column to leave_requests table';
  ELSE
    RAISE NOTICE 'review_notes column already exists';
  END IF;
END $$;

-- 7. Display sample leave requests to verify data
SELECT
  id,
  coach_id,
  leave_type,
  start_date,
  end_date,
  status,
  reviewed_by,
  reviewed_at,
  created_at
FROM leave_requests
ORDER BY created_at DESC
LIMIT 5;
