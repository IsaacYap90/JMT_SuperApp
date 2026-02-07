-- PT Session Cancellation Schema
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. ADD CANCELLATION FIELDS
-- ============================================

ALTER TABLE pt_sessions ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES users(id);
ALTER TABLE pt_sessions ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE pt_sessions ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- ============================================
-- 2. ADD INDEXES FOR QUERY PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_pt_sessions_cancelled ON pt_sessions(cancelled_at);
CREATE INDEX IF NOT EXISTS idx_pt_sessions_status_cancelled ON pt_sessions(status, cancelled_at);

-- ============================================
-- 3. UPDATED VIEW FOR ADMIN PT PAYMENTS
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
  ps.cancelled_at,
  ps.cancellation_reason,
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
  AND ps.cancelled_at IS NULL
ORDER BY ps.scheduled_at DESC;

-- ============================================
-- 4. FUNCTION TO GET CANCELLED SESSIONS
-- ============================================

CREATE OR REPLACE FUNCTION get_cancelled_sessions(coach_uuid uuid, start_date date, end_date date)
RETURNS TABLE (
  session_id text,
  session_date timestamptz,
  member_name text,
  cancellation_reason text,
  cancelled_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ps.id::text as session_id,
    ps.scheduled_at as session_date,
    m.full_name as member_name,
    ps.cancellation_reason,
    ps.cancelled_at
  FROM pt_sessions ps
  JOIN users m ON ps.member_id = m.id
  WHERE ps.coach_id = coach_uuid
    AND ps.cancelled_at IS NOT NULL
    AND ps.cancelled_at >= start_date::timestamptz
    AND ps.cancelled_at <= end_date::timestamptz
  ORDER BY ps.cancelled_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 5. FUNCTION TO GET SESSIONS FOR WEEKLY PAYMENT (Updated)
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
    COALESCE(ps.payment_amount, ps.commission_amount, ps.session_price * 0.5) as amount,
    m.full_name as member_name
  FROM pt_sessions ps
  JOIN users m ON ps.member_id = m.id
  WHERE ps.coach_id = coach_uuid
    AND ps.payment_approved = true
    AND ps.approved_at >= start_date::timestamptz
    AND ps.approved_at <= end_date::timestamptz
    AND ps.cancelled_at IS NULL
  ORDER BY ps.approved_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
