-- Coach Management Schema
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. ADD EMPLOYMENT FIELDS TO USERS TABLE
-- ============================================

-- Employment type: full_time or part_time
ALTER TABLE users ADD COLUMN IF NOT EXISTS employment_type VARCHAR(20) CHECK (employment_type IN ('full_time', 'part_time'));

-- Hourly rate for part-time coaches
ALTER TABLE users ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(10,2);

-- Base salary for full-time coaches
ALTER TABLE users ADD COLUMN IF NOT EXISTS base_salary DECIMAL(10,2);

-- Certifications (JSON or TEXT)
ALTER TABLE users ADD COLUMN IF NOT EXISTS certifications TEXT;

-- Start date of employment
ALTER TABLE users ADD COLUMN IF NOT EXISTS start_date DATE;

-- Account status (active/inactive) - already exists as is_active
-- No need to add

-- ============================================
-- 2. UPDATE CLASSES TABLE (if needed)
-- ============================================

-- Lead coach (should already exist)
-- ALTER TABLE classes ADD COLUMN IF NOT EXISTS lead_coach_id UUID REFERENCES users(id);

-- Assistant coach (optional)
ALTER TABLE classes ADD COLUMN IF NOT EXISTS assistant_coach_id UUID REFERENCES users(id);

-- ============================================
-- 3. CLASS_COACHES JUNCTION TABLE
-- ============================================
-- This table already exists for assigning multiple coaches to classes
-- Verify it has the correct structure

-- If it doesn't exist, create it:
CREATE TABLE IF NOT EXISTS class_coaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  coach_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(class_id, coach_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_class_coaches_class_id ON class_coaches(class_id);
CREATE INDEX IF NOT EXISTS idx_class_coaches_coach_id ON class_coaches(coach_id);

-- ============================================
-- 4. ADD INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_users_employment_type ON users(employment_type);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_start_date ON users(start_date);

-- ============================================
-- 5. DEFAULT PASSWORD FUNCTION
-- ============================================

-- Function to create a coach account with default password
CREATE OR REPLACE FUNCTION create_coach_account(
  p_email TEXT,
  p_full_name TEXT,
  p_phone TEXT DEFAULT NULL,
  p_employment_type VARCHAR(20) DEFAULT 'part_time',
  p_hourly_rate DECIMAL DEFAULT NULL,
  p_base_salary DECIMAL DEFAULT NULL,
  p_certifications TEXT DEFAULT NULL,
  p_emergency_contact_name TEXT DEFAULT NULL,
  p_emergency_contact_phone TEXT DEFAULT NULL,
  p_start_date DATE DEFAULT CURRENT_DATE
)
RETURNS UUID AS $$
DECLARE
  new_user_id UUID;
BEGIN
  -- Insert into users table
  INSERT INTO users (
    email,
    full_name,
    phone,
    role,
    employment_type,
    hourly_rate,
    base_salary,
    certifications,
    emergency_contact_name,
    emergency_contact_phone,
    start_date,
    is_active,
    is_first_login
  ) VALUES (
    p_email,
    p_full_name,
    p_phone,
    'coach',
    p_employment_type,
    p_hourly_rate,
    p_base_salary,
    p_certifications,
    p_emergency_contact_name,
    p_emergency_contact_phone,
    p_start_date,
    true,
    true
  ) RETURNING id INTO new_user_id;

  RETURN new_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 6. NOTES
-- ============================================

-- This schema enables:
-- - Full coach profile management with employment details
-- - Multiple coach assignment to classes (via class_coaches)
-- - Lead coach and optional assistant coach per class
-- - Performance indexes for queries

-- Default password "JMT1234" will be set via Supabase Auth API
-- when creating the account (not in this SQL)
