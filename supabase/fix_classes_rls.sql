-- Fix RLS policies on classes and class_coaches tables for admin edit/update
-- Run this in Supabase SQL Editor if class edit is blocked by RLS

-- === CLASSES TABLE ===

-- Allow admins to update classes
DO $$ BEGIN
  CREATE POLICY "Admins can update classes" ON classes
    FOR UPDATE USING (
      EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Allow admins to insert classes
DO $$ BEGIN
  CREATE POLICY "Admins can insert classes" ON classes
    FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Allow admins to read all classes (may already exist)
DO $$ BEGIN
  CREATE POLICY "Admins can view all classes" ON classes
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- === CLASS_COACHES TABLE ===

-- Allow admins to delete class_coaches (needed for coach reassignment)
DO $$ BEGIN
  CREATE POLICY "Admins can delete class_coaches" ON class_coaches
    FOR DELETE USING (
      EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Allow admins to insert class_coaches
DO $$ BEGIN
  CREATE POLICY "Admins can insert class_coaches" ON class_coaches
    FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Allow admins to read all class_coaches
DO $$ BEGIN
  CREATE POLICY "Admins can view class_coaches" ON class_coaches
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Allow coaches to read class_coaches (for their own schedule view)
DO $$ BEGIN
  CREATE POLICY "Coaches can view class_coaches" ON class_coaches
    FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
