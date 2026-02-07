-- ================================================
-- PT FLEXIBLE COMMISSION SYSTEM - SCHEMA CHANGES
-- Add per-coach session rates for flexible pricing
-- ================================================

-- Add session rate columns to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS solo_rate DECIMAL DEFAULT 80,
ADD COLUMN IF NOT EXISTS buddy_rate DECIMAL DEFAULT 120,
ADD COLUMN IF NOT EXISTS house_call_rate DECIMAL DEFAULT 140;

-- Set default rates for existing coaches
UPDATE users
SET
  solo_rate = COALESCE(solo_rate, 80),
  buddy_rate = COALESCE(buddy_rate, 120),
  house_call_rate = COALESCE(house_call_rate, 140)
WHERE role IN ('coach', 'master_admin');

-- Add session_rate column to pt_sessions if not exists (what client pays)
ALTER TABLE pt_sessions
ADD COLUMN IF NOT EXISTS session_rate DECIMAL;

-- Backfill session_rate for existing sessions based on session_type
UPDATE pt_sessions
SET session_rate = CASE
  WHEN session_type = 'solo_package' THEN 80
  WHEN session_type = 'solo_single' THEN 80
  WHEN session_type = 'buddy' THEN 120
  WHEN session_type = 'house_call' THEN 140
  ELSE 80
END
WHERE session_rate IS NULL;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_rates ON users(solo_rate, buddy_rate, house_call_rate);
CREATE INDEX IF NOT EXISTS idx_pt_sessions_rates ON pt_sessions(session_rate, commission_amount);

-- Verify the changes
SELECT
  id,
  full_name,
  role,
  employment_type,
  pt_commission_rate,
  solo_rate,
  buddy_rate,
  house_call_rate
FROM users
WHERE role IN ('coach', 'master_admin')
ORDER BY full_name;

-- Verify pt_sessions has session_rate
SELECT
  id,
  coach_id,
  session_type,
  session_rate,
  commission_amount,
  scheduled_at
FROM pt_sessions
ORDER BY scheduled_at DESC
LIMIT 10;
