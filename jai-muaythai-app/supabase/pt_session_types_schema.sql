-- PT Session Types and Commission Schema
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. ADD SESSION TYPE AND COMMISSION COLUMNS
-- ============================================

-- Session type: solo_package (default), solo_single, buddy, house_call
ALTER TABLE pt_sessions ADD COLUMN IF NOT EXISTS session_type VARCHAR(20) DEFAULT 'solo_package';

-- Commission amount: actual commission for this session
-- solo_package: S$40 (default)
-- solo_single: S$50
-- buddy: S$60
-- house_call: S$70
ALTER TABLE pt_sessions ADD COLUMN IF NOT EXISTS commission_amount DECIMAL(10,2);

-- ============================================
-- 2. ADD INDEXES FOR QUERY PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_pt_sessions_session_type ON pt_sessions(session_type);
CREATE INDEX IF NOT EXISTS idx_pt_sessions_commission_amount ON pt_sessions(commission_amount);

-- ============================================
-- 3. UPDATE EXISTING RECORDS (Run this manually)
-- ============================================
-- Update existing sessions to use default values:
-- UPDATE pt_sessions SET session_type = 'solo_package', commission_amount = 40.00 WHERE session_type IS NULL;

-- ============================================
-- 4. COMMISSION RATES REFERENCE
-- ============================================
-- solo_package:   S$40 commission (package sessions, most common)
-- solo_single:    S$50 commission (single drop-in sessions)
-- buddy:          S$60 commission (2 members, S$200 total)
-- house_call:     S$70 commission (at member's location)

-- ============================================
-- 5. UPDATED VIEW FOR ADMIN PT PAYMENTS
-- ============================================

DROP VIEW IF EXISTS admin_pt_payments_view;

CREATE OR REPLACE VIEW admin_pt_payments_view AS
SELECT
  ps.id,
  ps.scheduled_at,
  ps.session_type,
  ps.session_price,
  ps.commission_amount,
  ps.payment_amount,
  ps.payment_approved,
  ps.approved_at,
  ps.coach_verified,
  ps.member_verified,
  ps.verification_date,
  coach.full_name as coach_name,
  coach.email as coach_email,
  member.full_name as member_name,
  member.email as member_email,
  pp.id as package_id,
  pp.sessions_remaining
FROM pt_sessions ps
JOIN users coach ON ps.coach_id = coach.id
JOIN users member ON ps.member_id = member.id
LEFT JOIN pt_packages pp ON ps.package_id = pp.id
WHERE ps.coach_verified = true
  AND ps.member_verified = true
  AND ps.payment_approved = false
ORDER BY ps.scheduled_at DESC;

-- ============================================
-- 6. BUDDY SESSIONS SUPPORT
-- ============================================
-- For buddy sessions, create a separate table to track additional members
CREATE TABLE IF NOT EXISTS pt_session_buddy_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES pt_sessions(id) ON DELETE CASCADE,
  member_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for buddy members
CREATE INDEX IF NOT EXISTS idx_pt_session_buddy_members_session ON pt_session_buddy_members(session_id);
