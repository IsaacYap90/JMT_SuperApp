-- SEED: Isaac's PT Sessions (Feb 9 - Feb 15 2026)
-- Run this in Supabase SQL Editor

-- 1. Helper to get Coach Isaac's ID
CREATE OR REPLACE FUNCTION get_isaac_id() RETURNS UUID AS $$
  SELECT id FROM users WHERE email = 'isaac@jmt.com' LIMIT 1;
$$ LANGUAGE sql;

-- 2. Helper to get/create Member ID (Simple Upsert equivalent)
CREATE OR REPLACE FUNCTION get_or_create_member(name TEXT) RETURNS UUID AS $$
DECLARE
  m_id UUID;
BEGIN
  SELECT id INTO m_id FROM users WHERE full_name = name AND role = 'member' LIMIT 1;
  IF m_id IS NULL THEN
    INSERT INTO users (email, full_name, role, is_active)
    VALUES (
      lower(replace(name, ' ', '.')) || '@test.com',
      name,
      'member',
      true
    ) RETURNING id INTO m_id;
  END IF;
  RETURN m_id;
END;
$$ LANGUAGE plpgsql;

-- 3. Insert Sessions
DO $$
DECLARE
  isaac UUID;
BEGIN
  isaac := get_isaac_id();
  
  -- Monday 9 Feb
  INSERT INTO pt_sessions (coach_id, member_id, scheduled_at, duration_minutes, status, session_type, session_price, coach_verified)
  VALUES 
    (isaac, get_or_create_member('Thomas'), '2026-02-09 11:00:00+08', 60, 'attended', 'solo_package', 90, true),
    (isaac, get_or_create_member('Timothy'), '2026-02-09 20:30:00+08', 60, 'scheduled', 'solo_package', 90, false);

  -- Tuesday 10 Feb
  INSERT INTO pt_sessions (coach_id, member_id, scheduled_at, duration_minutes, status, session_type, session_price)
  VALUES 
    (isaac, get_or_create_member('Elizabeth'), '2026-02-10 20:30:00+08', 60, 'scheduled', 'solo_package', 90);

  -- Wednesday 11 Feb
  INSERT INTO pt_sessions (coach_id, member_id, scheduled_at, duration_minutes, status, session_type, session_price)
  VALUES 
    (isaac, get_or_create_member('Jensen & Wife'), '2026-02-11 11:00:00+08', 60, 'scheduled', 'buddy', 140),
    (isaac, get_or_create_member('Serene & Ember'), '2026-02-11 20:30:00+08', 60, 'scheduled', 'buddy', 140);

  -- Thursday 12 Feb
  INSERT INTO pt_sessions (coach_id, member_id, scheduled_at, duration_minutes, status, session_type, session_price)
  VALUES 
    (isaac, get_or_create_member('Nikki (Trial)'), '2026-02-12 14:00:00+08', 60, 'scheduled', 'solo_single', 90),
    (isaac, get_or_create_member('Corp Class'), '2026-02-12 15:00:00+08', 60, 'scheduled', 'solo_single', 150), -- Corp rate?
    (isaac, get_or_create_member('Elizabeth'), '2026-02-12 20:30:00+08', 60, 'scheduled', 'solo_package', 90);

  -- Friday 13 Feb
  INSERT INTO pt_sessions (coach_id, member_id, scheduled_at, duration_minutes, status, session_type, session_price)
  VALUES 
    (isaac, get_or_create_member('Gayatri'), '2026-02-13 10:00:00+08', 60, 'scheduled', 'solo_package', 90),
    (isaac, get_or_create_member('Thomas'), '2026-02-13 13:30:00+08', 60, 'scheduled', 'solo_package', 90),
    (isaac, get_or_create_member('Pamela & Sarah'), '2026-02-13 17:30:00+08', 60, 'scheduled', 'buddy', 140);

  -- Saturday 14 Feb
  INSERT INTO pt_sessions (coach_id, member_id, scheduled_at, duration_minutes, status, session_type, session_price)
  VALUES 
    (isaac, get_or_create_member('Shermin (TBC)'), '2026-02-14 09:00:00+08', 60, 'scheduled', 'solo_package', 90),
    (isaac, get_or_create_member('Niithiya'), '2026-02-14 12:30:00+08', 60, 'scheduled', 'solo_package', 90),
    (isaac, get_or_create_member('Tiffany'), '2026-02-14 13:30:00+08', 60, 'scheduled', 'solo_package', 90),
    (isaac, get_or_create_member('Ken & Janice'), '2026-02-14 14:30:00+08', 60, 'scheduled', 'buddy', 140),
    (isaac, get_or_create_member('Lynn Lim'), '2026-02-14 15:30:00+08', 60, 'scheduled', 'solo_package', 90);

  -- Sunday 15 Feb
  INSERT INTO pt_sessions (coach_id, member_id, scheduled_at, duration_minutes, status, session_type, session_price)
  VALUES 
    (isaac, get_or_create_member('Gayatri'), '2026-02-15 10:00:00+08', 60, 'scheduled', 'solo_package', 90),
    (isaac, get_or_create_member('Lynn Ng'), '2026-02-15 11:00:00+08', 60, 'scheduled', 'solo_package', 90),
    (isaac, get_or_create_member('TBC Session'), '2026-02-15 12:00:00+08', 60, 'scheduled', 'solo_package', 90),
    (isaac, get_or_create_member('Priscilla & Elsa'), '2026-02-15 13:00:00+08', 60, 'scheduled', 'buddy', 140);

END $$;

-- Cleanup functions
DROP FUNCTION get_isaac_id();
DROP FUNCTION get_or_create_member(TEXT);
