-- ============================================================
-- Payslips Table + Isaac Yap 2025 Data
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Add user fields for payslip display
ALTER TABLE users ADD COLUMN IF NOT EXISTS nric_last4 TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS citizenship_status TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id TEXT;

-- 2. Create payslips table
CREATE TABLE IF NOT EXISTS payslips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL,
  employment_type VARCHAR(20) NOT NULL DEFAULT 'full_time',

  -- Earnings
  base_salary DECIMAL(10,2) NOT NULL DEFAULT 0,
  class_earnings DECIMAL(10,2) NOT NULL DEFAULT 0,
  class_hours DECIMAL(10,2) NOT NULL DEFAULT 0,
  class_rate_per_hour DECIMAL(10,2) NOT NULL DEFAULT 0,
  pt_commission DECIMAL(10,2) NOT NULL DEFAULT 0,
  pt_session_count INTEGER NOT NULL DEFAULT 0,
  pt_weekly_breakdown JSONB DEFAULT '[]'::jsonb,

  -- Bonus
  bonus DECIMAL(10,2) NOT NULL DEFAULT 0,
  bonus_description TEXT DEFAULT '',

  -- Totals
  gross_pay DECIMAL(10,2) NOT NULL DEFAULT 0,

  -- Deductions
  cpf_contribution DECIMAL(10,2) NOT NULL DEFAULT 0,
  other_deductions DECIMAL(10,2) NOT NULL DEFAULT 0,
  deduction_details JSONB DEFAULT '[]'::jsonb,
  total_deductions DECIMAL(10,2) NOT NULL DEFAULT 0,

  -- Net Pay
  net_pay DECIMAL(10,2) NOT NULL DEFAULT 0,

  -- Status & Payment
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  payment_date TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint: one payslip per user per month
  UNIQUE(user_id, month, year)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payslips_user_id ON payslips(user_id);
CREATE INDEX IF NOT EXISTS idx_payslips_year_month ON payslips(year, month);

-- Enable RLS
ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Coaches can view their own payslips
CREATE POLICY "Coaches can view own payslips"
  ON payslips FOR SELECT
  USING (auth.uid() = user_id);

-- Master admin can view all payslips
CREATE POLICY "Master admin can view all payslips"
  ON payslips FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'master_admin'
    )
  );

-- Master admin can insert/update payslips
CREATE POLICY "Master admin can insert payslips"
  ON payslips FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'master_admin'
    )
  );

CREATE POLICY "Master admin can update payslips"
  ON payslips FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'master_admin'
    )
  );

-- ============================================================
-- 3. Update Isaac Yap's user record
-- ============================================================
-- Find Isaac's user ID and update his details
UPDATE users
SET
  nric_last4 = '994P',
  citizenship_status = 'work_permit',
  employee_id = 'JMT005'
WHERE email = 'isaac@jaimuaythai.com';

-- ============================================================
-- 4. Insert Isaac's 2025 Payslip Data (12 months)
-- ============================================================
-- Get Isaac's user_id dynamically
DO $$
DECLARE
  isaac_id UUID;
BEGIN
  SELECT id INTO isaac_id FROM users WHERE email = 'isaac@jaimuaythai.com';

  IF isaac_id IS NULL THEN
    RAISE EXCEPTION 'Isaac Yap user not found with email isaac@jaimuaythai.com';
  END IF;

  -- January 2025 (pay period: 08 Jan - 31 Jan)
  INSERT INTO payslips (user_id, month, year, employment_type, base_salary, pt_commission, pt_session_count, gross_pay, cpf_contribution, other_deductions, total_deductions, net_pay, status, payment_date)
  VALUES (isaac_id, 1, 2025, 'full_time', 1500.00, 2015.00, 0, 3515.00, 0, 0, 0, 3515.00, 'paid', '2025-01-31T00:00:00+08:00')
  ON CONFLICT (user_id, month, year) DO UPDATE SET
    base_salary = EXCLUDED.base_salary, pt_commission = EXCLUDED.pt_commission, gross_pay = EXCLUDED.gross_pay, net_pay = EXCLUDED.net_pay, status = EXCLUDED.status, payment_date = EXCLUDED.payment_date, updated_at = NOW();

  -- February 2025
  INSERT INTO payslips (user_id, month, year, employment_type, base_salary, pt_commission, pt_session_count, gross_pay, cpf_contribution, other_deductions, total_deductions, net_pay, status, payment_date)
  VALUES (isaac_id, 2, 2025, 'full_time', 1500.00, 3120.00, 0, 4620.00, 0, 0, 0, 4620.00, 'paid', '2025-02-28T00:00:00+08:00')
  ON CONFLICT (user_id, month, year) DO UPDATE SET
    base_salary = EXCLUDED.base_salary, pt_commission = EXCLUDED.pt_commission, gross_pay = EXCLUDED.gross_pay, net_pay = EXCLUDED.net_pay, status = EXCLUDED.status, payment_date = EXCLUDED.payment_date, updated_at = NOW();

  -- March 2025
  INSERT INTO payslips (user_id, month, year, employment_type, base_salary, pt_commission, pt_session_count, gross_pay, cpf_contribution, other_deductions, total_deductions, net_pay, status, payment_date)
  VALUES (isaac_id, 3, 2025, 'full_time', 1500.00, 2618.00, 0, 4118.00, 0, 0, 0, 4118.00, 'paid', '2025-03-31T00:00:00+08:00')
  ON CONFLICT (user_id, month, year) DO UPDATE SET
    base_salary = EXCLUDED.base_salary, pt_commission = EXCLUDED.pt_commission, gross_pay = EXCLUDED.gross_pay, net_pay = EXCLUDED.net_pay, status = EXCLUDED.status, payment_date = EXCLUDED.payment_date, updated_at = NOW();

  -- April 2025
  INSERT INTO payslips (user_id, month, year, employment_type, base_salary, pt_commission, pt_session_count, gross_pay, cpf_contribution, other_deductions, total_deductions, net_pay, status, payment_date)
  VALUES (isaac_id, 4, 2025, 'full_time', 1500.00, 1724.05, 0, 3224.05, 0, 0, 0, 3224.05, 'paid', '2025-04-30T00:00:00+08:00')
  ON CONFLICT (user_id, month, year) DO UPDATE SET
    base_salary = EXCLUDED.base_salary, pt_commission = EXCLUDED.pt_commission, gross_pay = EXCLUDED.gross_pay, net_pay = EXCLUDED.net_pay, status = EXCLUDED.status, payment_date = EXCLUDED.payment_date, updated_at = NOW();

  -- May 2025
  INSERT INTO payslips (user_id, month, year, employment_type, base_salary, pt_commission, pt_session_count, gross_pay, cpf_contribution, other_deductions, total_deductions, net_pay, status, payment_date)
  VALUES (isaac_id, 5, 2025, 'full_time', 1500.00, 1815.00, 0, 3315.00, 0, 0, 0, 3315.00, 'paid', '2025-05-31T00:00:00+08:00')
  ON CONFLICT (user_id, month, year) DO UPDATE SET
    base_salary = EXCLUDED.base_salary, pt_commission = EXCLUDED.pt_commission, gross_pay = EXCLUDED.gross_pay, net_pay = EXCLUDED.net_pay, status = EXCLUDED.status, payment_date = EXCLUDED.payment_date, updated_at = NOW();

  -- June 2025
  INSERT INTO payslips (user_id, month, year, employment_type, base_salary, pt_commission, pt_session_count, gross_pay, cpf_contribution, other_deductions, total_deductions, net_pay, status, payment_date)
  VALUES (isaac_id, 6, 2025, 'full_time', 1500.00, 2115.00, 0, 3615.00, 0, 0, 0, 3615.00, 'paid', '2025-06-30T00:00:00+08:00')
  ON CONFLICT (user_id, month, year) DO UPDATE SET
    base_salary = EXCLUDED.base_salary, pt_commission = EXCLUDED.pt_commission, gross_pay = EXCLUDED.gross_pay, net_pay = EXCLUDED.net_pay, status = EXCLUDED.status, payment_date = EXCLUDED.payment_date, updated_at = NOW();

  -- July 2025
  INSERT INTO payslips (user_id, month, year, employment_type, base_salary, pt_commission, pt_session_count, gross_pay, cpf_contribution, other_deductions, total_deductions, net_pay, status, payment_date)
  VALUES (isaac_id, 7, 2025, 'full_time', 1100.00, 1440.00, 0, 2540.00, 0, 0, 0, 2540.00, 'paid', '2025-07-31T00:00:00+08:00')
  ON CONFLICT (user_id, month, year) DO UPDATE SET
    base_salary = EXCLUDED.base_salary, pt_commission = EXCLUDED.pt_commission, gross_pay = EXCLUDED.gross_pay, net_pay = EXCLUDED.net_pay, status = EXCLUDED.status, payment_date = EXCLUDED.payment_date, updated_at = NOW();

  -- August 2025
  INSERT INTO payslips (user_id, month, year, employment_type, base_salary, pt_commission, pt_session_count, gross_pay, cpf_contribution, other_deductions, total_deductions, net_pay, status, payment_date)
  VALUES (isaac_id, 8, 2025, 'full_time', 1300.00, 2070.00, 0, 3370.00, 0, 0, 0, 3370.00, 'paid', '2025-08-31T00:00:00+08:00')
  ON CONFLICT (user_id, month, year) DO UPDATE SET
    base_salary = EXCLUDED.base_salary, pt_commission = EXCLUDED.pt_commission, gross_pay = EXCLUDED.gross_pay, net_pay = EXCLUDED.net_pay, status = EXCLUDED.status, payment_date = EXCLUDED.payment_date, updated_at = NOW();

  -- September 2025
  INSERT INTO payslips (user_id, month, year, employment_type, base_salary, pt_commission, pt_session_count, gross_pay, cpf_contribution, other_deductions, total_deductions, net_pay, status, payment_date)
  VALUES (isaac_id, 9, 2025, 'full_time', 1500.00, 1832.87, 0, 3332.87, 0, 0, 0, 3332.87, 'paid', '2025-09-30T00:00:00+08:00')
  ON CONFLICT (user_id, month, year) DO UPDATE SET
    base_salary = EXCLUDED.base_salary, pt_commission = EXCLUDED.pt_commission, gross_pay = EXCLUDED.gross_pay, net_pay = EXCLUDED.net_pay, status = EXCLUDED.status, payment_date = EXCLUDED.payment_date, updated_at = NOW();

  -- October 2025
  INSERT INTO payslips (user_id, month, year, employment_type, base_salary, pt_commission, pt_session_count, gross_pay, cpf_contribution, other_deductions, total_deductions, net_pay, status, payment_date)
  VALUES (isaac_id, 10, 2025, 'full_time', 1500.00, 2050.00, 0, 3550.00, 0, 0, 0, 3550.00, 'paid', '2025-10-31T00:00:00+08:00')
  ON CONFLICT (user_id, month, year) DO UPDATE SET
    base_salary = EXCLUDED.base_salary, pt_commission = EXCLUDED.pt_commission, gross_pay = EXCLUDED.gross_pay, net_pay = EXCLUDED.net_pay, status = EXCLUDED.status, payment_date = EXCLUDED.payment_date, updated_at = NOW();

  -- November 2025
  INSERT INTO payslips (user_id, month, year, employment_type, base_salary, pt_commission, pt_session_count, gross_pay, cpf_contribution, other_deductions, total_deductions, net_pay, status, payment_date)
  VALUES (isaac_id, 11, 2025, 'full_time', 1600.00, 2210.00, 0, 3810.00, 0, 0, 0, 3810.00, 'paid', '2025-11-30T00:00:00+08:00')
  ON CONFLICT (user_id, month, year) DO UPDATE SET
    base_salary = EXCLUDED.base_salary, pt_commission = EXCLUDED.pt_commission, gross_pay = EXCLUDED.gross_pay, net_pay = EXCLUDED.net_pay, status = EXCLUDED.status, payment_date = EXCLUDED.payment_date, updated_at = NOW();

  -- December 2025
  INSERT INTO payslips (user_id, month, year, employment_type, base_salary, pt_commission, pt_session_count, gross_pay, cpf_contribution, other_deductions, total_deductions, net_pay, status, payment_date)
  VALUES (isaac_id, 12, 2025, 'full_time', 1600.00, 2540.00, 0, 4140.00, 0, 0, 0, 4140.00, 'paid', '2025-12-31T00:00:00+08:00')
  ON CONFLICT (user_id, month, year) DO UPDATE SET
    base_salary = EXCLUDED.base_salary, pt_commission = EXCLUDED.pt_commission, gross_pay = EXCLUDED.gross_pay, net_pay = EXCLUDED.net_pay, status = EXCLUDED.status, payment_date = EXCLUDED.payment_date, updated_at = NOW();

END $$;
