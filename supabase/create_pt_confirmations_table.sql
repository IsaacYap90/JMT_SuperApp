-- Create pt_confirmations table for Sunday Prep status tracking
CREATE TABLE IF NOT EXISTS pt_confirmations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pt_session_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'unsent' CHECK (status IN ('unsent', 'sent', 'replied')),
  week_start DATE NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(pt_session_id, week_start)
);

-- Enable RLS
ALTER TABLE pt_confirmations ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins full access to pt_confirmations" ON pt_confirmations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
  );
