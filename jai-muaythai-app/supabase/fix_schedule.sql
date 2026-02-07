-- Fix Classes Schedule
-- Run this in Supabase SQL Editor
-- This will replace all existing classes and lead coach assignments

-- ============================================
-- 0. ADD schedule_id COLUMN (if not exists)
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'classes' AND column_name = 'schedule_id'
  ) THEN
    ALTER TABLE classes ADD COLUMN schedule_id TEXT UNIQUE;
  END IF;
END $$;

-- ============================================
-- 1. DELETE EXISTING DATA
-- ============================================
DELETE FROM class_coaches;
DELETE FROM classes;

-- ============================================
-- 2. INSERT ALL CLASSES WITH UUIDs AND schedule_id
-- ============================================

-- MONDAY
INSERT INTO classes (name, description, day_of_week, start_time, end_time, capacity, is_active, schedule_id, created_at)
VALUES
  -- Monday 7am
  ('All-Levels', 'General muay thai class for all levels', 'monday', '07:00:00', '08:00:00', 20, true, 'mon-7am-alllevels', NOW()),
  -- Monday 12pm
  ('All-Levels', 'General muay thai class for all levels', 'monday', '12:00:00', '13:00:00', 20, true, 'mon-12pm-alllevels', NOW()),
  -- Monday 6:30pm
  ('All-Levels', 'General muay thai class for all levels', 'monday', '18:30:00', '19:30:00', 20, true, 'mon-630pm-alllevels', NOW()),
  -- Monday 7:30pm
  ('All-Levels', 'General muay thai class for all levels', 'monday', '19:30:00', '20:30:00', 20, true, 'mon-730pm-alllevels', NOW()),

  -- TUESDAY
  ('All-Levels', 'General muay thai class for all levels', 'tuesday', '12:00:00', '13:00:00', 20, true, 'tue-12pm-alllevels', NOW()),
  ('Kids', 'Kids muay thai class', 'tuesday', '16:30:00', '17:15:00', 15, true, 'tue-430pm-kids', NOW()),
  ('Pre-Teen', 'Pre-teen muay thai class', 'tuesday', '17:15:00', '18:00:00', 15, true, 'tue-515pm-preteen', NOW()),
  ('All-Levels', 'General muay thai class for all levels', 'tuesday', '18:30:00', '19:30:00', 20, true, 'tue-630pm-alllevels', NOW()),
  ('All-Levels', 'General muay thai class for all levels', 'tuesday', '19:30:00', '20:30:00', 20, true, 'tue-730pm-alllevels', NOW()),
  ('Advanced/Sparring', 'Advanced class with sparring', 'tuesday', '20:30:00', '21:30:00', 15, true, 'tue-830pm-advanced', NOW()),

  -- WEDNESDAY
  ('All-Levels', 'General muay thai class for all levels', 'wednesday', '07:00:00', '08:00:00', 20, true, 'wed-7am-alllevels', NOW()),
  ('All-Levels', 'General muay thai class for all levels', 'wednesday', '12:00:00', '13:00:00', 20, true, 'wed-12pm-alllevels', NOW()),
  ('All-Levels', 'General muay thai class for all levels', 'wednesday', '18:30:00', '19:30:00', 20, true, 'wed-630pm-alllevels', NOW()),
  ('All-Levels', 'General muay thai class for all levels', 'wednesday', '19:30:00', '20:30:00', 20, true, 'wed-730pm-alllevels', NOW()),

  -- THURSDAY
  ('All-Levels', 'General muay thai class for all levels', 'thursday', '12:00:00', '13:00:00', 20, true, 'thu-12pm-alllevels', NOW()),
  ('Kids', 'Kids muay thai class', 'thursday', '16:30:00', '17:15:00', 15, true, 'thu-430pm-kids', NOW()),
  ('Pre-Teen', 'Pre-teen muay thai class', 'thursday', '17:15:00', '18:00:00', 15, true, 'thu-515pm-preteen', NOW()),
  ('All-Levels', 'General muay thai class for all levels', 'thursday', '18:30:00', '19:30:00', 20, true, 'thu-630pm-alllevels', NOW()),
  ('All-Levels', 'General muay thai class for all levels', 'thursday', '19:30:00', '20:30:00', 20, true, 'thu-730pm-alllevels', NOW()),
  ('Advanced', 'Advanced muay thai class', 'thursday', '20:30:00', '21:30:00', 15, true, 'thu-830pm-advanced', NOW()),

  -- FRIDAY
  ('All-Levels', 'General muay thai class for all levels', 'friday', '07:00:00', '08:00:00', 20, true, 'fri-7am-alllevels', NOW()),
  ('All-Levels', 'General muay thai class for all levels', 'friday', '12:00:00', '13:00:00', 20, true, 'fri-12pm-alllevels', NOW()),
  ('All-Levels', 'General muay thai class for all levels', 'friday', '18:30:00', '19:30:00', 20, true, 'fri-630pm-alllevels', NOW()),
  ('All-Levels', 'General muay thai class for all levels', 'friday', '19:30:00', '20:30:00', 20, true, 'fri-730pm-alllevels', NOW()),

  -- SATURDAY
  ('Kids', 'Kids muay thai class', 'saturday', '10:00:00', '10:45:00', 15, true, 'sat-10am-kids', NOW()),
  ('Pre-Teen', 'Pre-teen muay thai class', 'saturday', '10:45:00', '11:30:00', 15, true, 'sat-1045am-preteen', NOW()),
  ('All-Levels', 'General muay thai class for all levels', 'saturday', '11:30:00', '12:30:00', 20, true, 'sat-1130am-alllevels', NOW()),
  ('Fundamental', 'Fundamental muay thai class', 'saturday', '12:00:00', '13:00:00', 20, true, 'sat-12pm-fundamental', NOW());

-- ============================================
-- 3. UPDATE LEAD COACH ASSIGNMENTS
-- ============================================

-- Helper: Get user ID by email pattern
CREATE OR REPLACE FUNCTION get_user_id_by_email(pattern TEXT)
RETURNS UUID AS $$
  SELECT id FROM users WHERE email LIKE pattern OR full_name LIKE pattern LIMIT 1;
$$ LANGUAGE sql;

-- Helper: Get user ID by exact email
CREATE OR REPLACE FUNCTION get_user_id_by_exact_email(email TEXT)
RETURNS UUID AS $$
  SELECT id FROM users WHERE email = email LIMIT 1;
$$ LANGUAGE sql;

-- MONDAY Coaches
-- Monday 7am: Shafiq L
UPDATE classes SET lead_coach_id = get_user_id_by_email('%shafiq%') WHERE schedule_id = 'mon-7am-alllevels';

-- Monday 12pm: Shafiq L
UPDATE classes SET lead_coach_id = get_user_id_by_email('%shafiq%') WHERE schedule_id = 'mon-12pm-alllevels';

-- Monday 6:30pm: Fairuz L
UPDATE classes SET lead_coach_id = get_user_id_by_email('%fairuz%') WHERE schedule_id = 'mon-630pm-alllevels';

-- Monday 7:30pm: Fairuz L
UPDATE classes SET lead_coach_id = get_user_id_by_email('%fairuz%') WHERE schedule_id = 'mon-730pm-alllevels';

-- TUESDAY Coaches
-- Tuesday 12pm: Shafiq L
UPDATE classes SET lead_coach_id = get_user_id_by_exact_email('shafiq@jmt.com') WHERE schedule_id = 'tue-12pm-alllevels';

-- Tuesday 4:30pm Kids: Isaac (Lead)
UPDATE classes SET lead_coach_id = get_user_id_by_exact_email('isaac@jmt.com') WHERE schedule_id = 'tue-430pm-kids';

-- Tuesday 5:15pm Pre-Teen: Isaac (Lead)
UPDATE classes SET lead_coach_id = get_user_id_by_exact_email('isaac@jmt.com') WHERE schedule_id = 'tue-515pm-preteen';

-- Tuesday 6:30pm All-Levels: Isaac (Lead)
UPDATE classes SET lead_coach_id = get_user_id_by_exact_email('isaac@jmt.com') WHERE schedule_id = 'tue-630pm-alllevels';

-- Tuesday 7:30pm All-Levels: Isaac (Lead)
UPDATE classes SET lead_coach_id = get_user_id_by_exact_email('isaac@jmt.com') WHERE schedule_id = 'tue-730pm-alllevels';

-- Tuesday 8:30pm Advanced/Sparring: Jeremy (Lead)
UPDATE classes SET lead_coach_id = get_user_id_by_email('%jeremy%') WHERE schedule_id = 'tue-830pm-advanced';

-- WEDNESDAY Coaches
-- Wednesday 7am: Shafiq (Lead)
UPDATE classes SET lead_coach_id = get_user_id_by_exact_email('shafiq@jmt.com') WHERE schedule_id = 'wed-7am-alllevels';

-- Wednesday 12pm: Isaac (Lead)
UPDATE classes SET lead_coach_id = get_user_id_by_exact_email('isaac@jmt.com') WHERE schedule_id = 'wed-12pm-alllevels';

-- Wednesday 6:30pm: Isaac (Lead)
UPDATE classes SET lead_coach_id = get_user_id_by_exact_email('isaac@jmt.com') WHERE schedule_id = 'wed-630pm-alllevels';

-- Wednesday 7:30pm: Isaac (Lead)
UPDATE classes SET lead_coach_id = get_user_id_by_exact_email('isaac@jmt.com') WHERE schedule_id = 'wed-730pm-alllevels';

-- THURSDAY Coaches
-- Thursday 12pm: Shafiq L
UPDATE classes SET lead_coach_id = get_user_id_by_exact_email('shafiq@jmt.com') WHERE schedule_id = 'thu-12pm-alllevels';

-- Thursday 4:30pm Kids: Isaac (Lead)
UPDATE classes SET lead_coach_id = get_user_id_by_exact_email('isaac@jmt.com') WHERE schedule_id = 'thu-430pm-kids';

-- Thursday 5:15pm Pre-Teen: Isaac (Lead)
UPDATE classes SET lead_coach_id = get_user_id_by_exact_email('isaac@jmt.com') WHERE schedule_id = 'thu-515pm-preteen';

-- Thursday 6:30pm: Isaac (Lead)
UPDATE classes SET lead_coach_id = get_user_id_by_exact_email('isaac@jmt.com') WHERE schedule_id = 'thu-630pm-alllevels';

-- Thursday 7:30pm: Isaac (Lead)
UPDATE classes SET lead_coach_id = get_user_id_by_exact_email('isaac@jmt.com') WHERE schedule_id = 'thu-730pm-alllevels';

-- Thursday 8:30pm Advanced: Jeremy (Lead)
UPDATE classes SET lead_coach_id = get_user_id_by_email('%jeremy%') WHERE schedule_id = 'thu-830pm-advanced';

-- FRIDAY Coaches
-- Friday 7am: TBC (leave NULL)

-- Friday 12pm: Sasi L
UPDATE classes SET lead_coach_id = get_user_id_by_email('%sasi%') WHERE schedule_id = 'fri-12pm-alllevels';

-- Friday 6:30pm: Isaac L
UPDATE classes SET lead_coach_id = get_user_id_by_exact_email('isaac@jmt.com') WHERE schedule_id = 'fri-630pm-alllevels';

-- Friday 7:30pm: Isaac L
UPDATE classes SET lead_coach_id = get_user_id_by_exact_email('isaac@jmt.com') WHERE schedule_id = 'fri-730pm-alllevels';

-- SATURDAY Coaches
-- Saturday 10am Kids: Shafiq L
UPDATE classes SET lead_coach_id = get_user_id_by_exact_email('shafiq@jmt.com') WHERE schedule_id = 'sat-10am-kids';

-- Saturday 10:45am Pre-Teen: Jeremy L
UPDATE classes SET lead_coach_id = get_user_id_by_email('%jeremy%') WHERE schedule_id = 'sat-1045am-preteen';

-- Saturday 11:30am All-Levels: Jeremy L
UPDATE classes SET lead_coach_id = get_user_id_by_email('%jeremy%') WHERE schedule_id = 'sat-1130am-alllevels';

-- Saturday 12pm Fundamental: TBC (leave NULL)

-- Drop helper functions
DROP FUNCTION IF EXISTS get_user_id_by_email(TEXT);
DROP FUNCTION IF EXISTS get_user_id_by_exact_email(TEXT);

-- ============================================
-- 4. VERIFY DATA
-- ============================================
SELECT 'Classes created:' as info, COUNT(*) as count FROM classes;
SELECT 'Classes with lead coach:' as info, COUNT(*) as count FROM classes WHERE lead_coach_id IS NOT NULL;

-- Show all classes with their lead coaches
SELECT
  c.name as class_name,
  c.day_of_week,
  c.start_time,
  c.end_time,
  c.schedule_id,
  u.full_name as lead_coach
FROM classes c
LEFT JOIN users u ON c.lead_coach_id = u.id
ORDER BY
  CASE lower(c.day_of_week)
    WHEN 'monday' THEN 1
    WHEN 'tuesday' THEN 2
    WHEN 'wednesday' THEN 3
    WHEN 'thursday' THEN 4
    WHEN 'friday' THEN 5
    WHEN 'saturday' THEN 6
    WHEN 'sunday' THEN 7
  END,
  c.start_time;
