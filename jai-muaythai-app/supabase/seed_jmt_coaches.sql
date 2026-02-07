-- Seed JMT Coaches
-- Run this in Supabase SQL Editor
--
-- IMPORTANT: This script only creates user records.
-- You must create auth accounts separately via Supabase Dashboard or use the alternative method below.

-- ============================================
-- METHOD 1: SIMPLE USER TABLE SEEDING
-- ============================================
-- This creates placeholder users. You'll need to create auth accounts via Dashboard.

-- First, generate UUIDs for each coach (these will be replaced when auth accounts are created)
INSERT INTO public.users (id, email, full_name, role, employment_type, base_salary, hourly_rate, start_date, is_active, is_first_login, created_at)
VALUES
  -- 1. Jeremy Jude - Master Admin (Full-Time)
  (gen_random_uuid(), 'jeremy@jmt.com', 'Jeremy Jude', 'master_admin', 'full_time', 5000.00, NULL, '2020-01-01', true, true, NOW()),

  -- 2. Shafiq Nuri - Senior Coach (Part-Time)
  (gen_random_uuid(), 'shafiq@jmt.com', 'Shafiq Nuri', 'coach', 'part_time', NULL, 50.00, '2020-06-01', true, true, NOW()),

  -- 3. Sasi - Coach (Part-Time)
  (gen_random_uuid(), 'sasi@jmt.com', 'Sasi', 'coach', 'part_time', NULL, 50.00, '2021-03-01', true, true, NOW()),

  -- 4. Heng - Assistant Coach (Part-Time)
  (gen_random_uuid(), 'heng@jmt.com', 'Heng', 'coach', 'part_time', NULL, 45.00, '2022-01-15', true, true, NOW()),

  -- 5. Larvin - Coach (Part-Time)
  (gen_random_uuid(), 'larvin@jmt.com', 'Larvin', 'coach', 'part_time', NULL, 50.00, '2021-09-01', true, true, NOW()),

  -- 6. Isaac Yap - Assistant Coach (Full-Time)
  (gen_random_uuid(), 'isaac@jmt.com', 'Isaac Yap', 'coach', 'full_time', 3500.00, NULL, '2023-06-01', true, true, NOW())
ON CONFLICT (email) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  employment_type = EXCLUDED.employment_type,
  base_salary = EXCLUDED.base_salary,
  hourly_rate = EXCLUDED.hourly_rate,
  start_date = EXCLUDED.start_date,
  is_first_login = true,
  is_active = true;

-- ============================================
-- VERIFICATION
-- ============================================
SELECT
  email,
  full_name,
  role,
  employment_type,
  CASE
    WHEN employment_type = 'full_time' THEN 'S$' || base_salary::TEXT || '/month'
    ELSE 'S$' || hourly_rate::TEXT || '/hour'
  END as compensation,
  start_date,
  is_active,
  is_first_login
FROM public.users
WHERE email IN (
  'jeremy@jmt.com',
  'shafiq@jmt.com',
  'sasi@jmt.com',
  'heng@jmt.com',
  'larvin@jmt.com',
  'isaac@jmt.com'
)
ORDER BY start_date;

-- ============================================
-- NEXT STEPS
-- ============================================
-- After running this script, create auth accounts via Supabase Dashboard:
--
-- 1. Go to: Authentication > Users > Add User
-- 2. For each coach above, create account with:
--    - Email: [email from list]
--    - Password: JMT1234
--    - Auto Confirm: YES
--
-- OR use the Admin API method below:

-- ============================================
-- METHOD 2: ADMIN API FUNCTION (ADVANCED)
-- ============================================
-- Create this function first, then call it to create auth accounts:

CREATE OR REPLACE FUNCTION create_coach_with_auth(
  p_email TEXT,
  p_full_name TEXT,
  p_role TEXT,
  p_employment_type TEXT,
  p_compensation DECIMAL,
  p_start_date DATE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Generate a new UUID for the user
  v_user_id := gen_random_uuid();

  -- Insert into users table
  INSERT INTO public.users (
    id,
    email,
    full_name,
    role,
    employment_type,
    base_salary,
    hourly_rate,
    start_date,
    is_active,
    is_first_login,
    created_at
  ) VALUES (
    v_user_id,
    p_email,
    p_full_name,
    p_role,
    p_employment_type,
    CASE WHEN p_employment_type = 'full_time' THEN p_compensation ELSE NULL END,
    CASE WHEN p_employment_type = 'part_time' THEN p_compensation ELSE NULL END,
    p_start_date,
    true,
    true,
    NOW()
  )
  ON CONFLICT (email) DO UPDATE SET
    full_name = p_full_name,
    role = p_role,
    employment_type = p_employment_type,
    base_salary = CASE WHEN p_employment_type = 'full_time' THEN p_compensation ELSE users.base_salary END,
    hourly_rate = CASE WHEN p_employment_type = 'part_time' THEN p_compensation ELSE users.hourly_rate END,
    start_date = p_start_date,
    is_first_login = true
  RETURNING id INTO v_user_id;

  RETURN v_user_id;
END;
$$;

-- Call the function for each coach:
-- SELECT create_coach_with_auth('jeremy@jmt.com', 'Jeremy Jude', 'master_admin', 'full_time', 5000.00, '2020-01-01');
-- SELECT create_coach_with_auth('shafiq@jmt.com', 'Shafiq Nuri', 'coach', 'part_time', 50.00, '2020-06-01');
-- SELECT create_coach_with_auth('sasi@jmt.com', 'Sasi', 'coach', 'part_time', 50.00, '2021-03-01');
-- SELECT create_coach_with_auth('heng@jmt.com', 'Heng', 'coach', 'part_time', 45.00, '2022-01-15');
-- SELECT create_coach_with_auth('larvin@jmt.com', 'Larvin', 'coach', 'part_time', 50.00, '2021-09-01');
-- SELECT create_coach_with_auth('isaac@jmt.com', 'Isaac Yap', 'coach', 'full_time', 3500.00, '2023-06-01');

-- Note: You still need to create auth accounts via Dashboard with password JMT1234
