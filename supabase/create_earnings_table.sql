-- Create earnings table for manual earning tracking
CREATE TABLE IF NOT EXISTS earnings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('salary', 'pt_weekly', 'bonus', 'other')),
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE earnings ENABLE ROW LEVEL SECURITY;

-- Coach can manage their own earnings
CREATE POLICY "Coaches can view own earnings"
  ON earnings FOR SELECT
  USING (auth.uid() = coach_id);

CREATE POLICY "Coaches can insert own earnings"
  ON earnings FOR INSERT
  WITH CHECK (auth.uid() = coach_id);

CREATE POLICY "Coaches can update own earnings"
  ON earnings FOR UPDATE
  USING (auth.uid() = coach_id);

CREATE POLICY "Coaches can delete own earnings"
  ON earnings FOR DELETE
  USING (auth.uid() = coach_id);

-- Index
CREATE INDEX idx_earnings_coach_date ON earnings(coach_id, date DESC);
