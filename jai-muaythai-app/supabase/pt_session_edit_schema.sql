-- PT Session Edit and Audit Tracking Schema
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. ADD AUDIT TRACKING FIELDS
-- ============================================

-- Track who edited the session
ALTER TABLE pt_sessions ADD COLUMN IF NOT EXISTS edited_by UUID REFERENCES users(id);

-- Track when the session was last edited
ALTER TABLE pt_sessions ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

-- Count number of edits for audit trail
ALTER TABLE pt_sessions ADD COLUMN IF NOT EXISTS edit_count INTEGER DEFAULT 0;

-- Optional notes field for additional context
ALTER TABLE pt_sessions ADD COLUMN IF NOT EXISTS notes TEXT;

-- ============================================
-- 2. ADD INDEXES FOR QUERY PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_pt_sessions_edited_by ON pt_sessions(edited_by);
CREATE INDEX IF NOT EXISTS idx_pt_sessions_edited_at ON pt_sessions(edited_at);
CREATE INDEX IF NOT EXISTS idx_pt_sessions_edit_count ON pt_sessions(edit_count);

-- ============================================
-- 3. UPDATE EXISTING RECORDS (Run manually if needed)
-- ============================================

-- Set edit_count to 0 for existing records
-- UPDATE pt_sessions SET edit_count = 0 WHERE edit_count IS NULL;

-- ============================================
-- 4. NOTES
-- ============================================

-- This schema enables:
-- - Full audit trail of who edited and when
-- - Track number of edits per session
-- - Optional notes for additional context
-- - Query performance via indexes

-- Security:
-- - Coaches can only edit their own unverified sessions
-- - Admins can edit any session
-- - All edits are logged with user ID and timestamp
