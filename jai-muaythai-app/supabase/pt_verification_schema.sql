-- PT Session Attendance Verification System
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. ADD VERIFICATION FIELDS TO PT_SESSIONS
-- ============================================

ALTER TABLE pt_sessions ADD COLUMN IF NOT EXISTS coach_verified BOOLEAN DEFAULT false;
ALTER TABLE pt_sessions ADD COLUMN IF NOT EXISTS member_verified BOOLEAN DEFAULT false;
ALTER TABLE pt_sessions ADD COLUMN IF NOT EXISTS verification_date TIMESTAMPTZ;
ALTER TABLE pt_sessions ADD COLUMN IF NOT EXISTS payment_approved BOOLEAN DEFAULT false;
ALTER TABLE pt_sessions ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id);
ALTER TABLE pt_sessions ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE pt_sessions ADD COLUMN IF NOT EXISTS payment_amount DECIMAL(10,2);
ALTER TABLE pt_sessions ADD COLUMN IF NOT EXISTS package_id UUID REFERENCES pt_packages(id);

-- ============================================
-- 2. ADD INDEXES FOR QUERY PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_pt_sessions_coach_verified ON pt_sessions(coach_id, coach_verified);
CREATE INDEX IF NOT EXISTS idx_pt_sessions_member_verified ON pt_sessions(member_id, member_verified);
CREATE INDEX IF NOT EXISTS idx_pt_sessions_payment_approved ON pt_sessions(payment_approved);
CREATE INDEX IF NOT EXISTS idx_pt_sessions_scheduled_at ON pt_sessions(scheduled_at);

-- ============================================
-- 3. CREATE VIEW FOR ADMIN PT PAYMENTS
-- ============================================

CREATE OR REPLACE VIEW admin_pt_payments_view AS
SELECT
  ps.id,
  ps.scheduled_at,
  ps.session_price,
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
-- 4. FUNCTION TO GET SESSIONS FOR WEEKLY PAYMENT
-- ============================================

CREATE OR REPLACE FUNCTION get_sessions_for_week(coach_uuid uuid, start_date date, end_date date)
RETURNS TABLE (
  session_id text,
  session_date timestamptz,
  amount numeric,
  member_name text
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ps.id::text as session_id,
    ps.scheduled_at as session_date,
    COALESCE(ps.payment_amount, ps.session_price * 0.5) as amount,
    m.full_name as member_name
  FROM pt_sessions ps
  JOIN users m ON ps.member_id = m.id
  WHERE ps.coach_id = coach_uuid
    AND ps.payment_approved = true
    AND ps.approved_at >= start_date::timestamptz
    AND ps.approved_at <= end_date::timestamptz
  ORDER BY ps.approved_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 5. STATUS ENUM (Optional - for reference)
-- ============================================
-- The status flow is:
-- scheduled → coach_verified → member_verified → payment_approved → paid
--
-- Visual indicators:
-- Scheduled: Orange badge
-- Coach Verified Only (waiting for member): Yellow badge
-- Both Verified (pending payment): Green badge
-- Payment Approved/Paid: Blue badge
