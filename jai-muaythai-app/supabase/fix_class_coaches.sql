-- Populate class_coaches table with lead coach assignments
-- Run this in Supabase SQL Editor after fix_schedule.sql
-- This fixes the issue where class cards disappeared from the app

-- First, verify classes exist
SELECT 'Classes in database:' as info, COUNT(*) as count FROM classes;

-- Populate class_coaches with lead coach assignments
INSERT INTO class_coaches (class_id, coach_id)
SELECT c.id, c.lead_coach_id
FROM classes c
WHERE c.lead_coach_id IS NOT NULL
ON CONFLICT (class_id, coach_id) DO NOTHING;

-- Verify class_coaches populated
SELECT 'Coach assignments in class_coaches:' as info, COUNT(*) as count FROM class_coaches;

-- Show all assignments
SELECT
  cc.id,
  c.name as class_name,
  c.day_of_week,
  c.start_time,
  u.full_name as coach_name
FROM class_coaches cc
JOIN classes c ON cc.class_id = c.id
JOIN users u ON cc.coach_id = u.id
ORDER BY c.day_of_week, c.start_time;
