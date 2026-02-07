-- ================================================
-- COACH DETAILS SCHEMA MIGRATION
-- Adds missing columns to users table and RLS policies for admin updates
-- ================================================

-- Add missing columns to users table if they don't exist
ALTER TABLE users
ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL,
ADD COLUMN IF NOT EXISTS base_salary DECIMAL,
ADD COLUMN IF NOT EXISTS pt_commission_rate DECIMAL DEFAULT 0.5,
ADD COLUMN IF NOT EXISTS employment_type TEXT,
ADD COLUMN IF NOT EXISTS certifications TEXT,
ADD COLUMN IF NOT EXISTS start_date DATE,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_users_employment_type ON users(employment_type);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- Drop existing policy if it exists (to avoid conflicts)
DROP POLICY IF EXISTS "Admin can update users" ON users;

-- Create RLS policy for admin to update users
CREATE POLICY "Admin can update users" ON users
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.role IN ('admin', 'master_admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.role IN ('admin', 'master_admin')
  )
);

-- Verify policies
SELECT
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'users'
AND cmd = 'UPDATE';

-- Display current columns in users table
SELECT
  column_name,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_name = 'users'
ORDER BY ordinal_position;
