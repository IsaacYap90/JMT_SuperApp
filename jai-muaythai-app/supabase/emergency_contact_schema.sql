-- Add emergency contact fields to users table
-- Run this in Supabase SQL Editor

ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_relationship TEXT;
