-- Create leaves table for JMT Dashboard leave management
CREATE TABLE IF NOT EXISTS leaves (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  leave_date DATE NOT NULL,
  leave_type TEXT NOT NULL CHECK (leave_type IN ('sick', 'annual', 'emergency')),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES public.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE leaves ENABLE ROW LEVEL SECURITY;

-- Coaches can view their own leaves
CREATE POLICY "Coaches can view own leaves" ON leaves
  FOR SELECT USING (auth.uid() = coach_id);

-- Coaches can insert their own leaves
CREATE POLICY "Coaches can insert own leaves" ON leaves
  FOR INSERT WITH CHECK (auth.uid() = coach_id);

-- Admins can view all leaves
CREATE POLICY "Admins can view all leaves" ON leaves
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
  );

-- Admins can update leaves (approve/reject)
CREATE POLICY "Admins can update leaves" ON leaves
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
  );
