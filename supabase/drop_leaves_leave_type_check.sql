-- Option 2: app-level leave-type validation replaces the DB CHECK constraint.
-- Validation now lives in src/lib/types/database.ts (LEAVE_TYPE_VALUES / isValidLeaveType)
-- and is enforced in the submitLeave server action — single source of truth, so the
-- form's leave types can't drift out of sync with what the backend accepts.
--
-- IMPORTANT: run this ONLY AFTER the app-level validation is deployed to prod.
-- Until then the (already-widened) constraint stays as the guard, so there's never
-- a window with no validation.

ALTER TABLE leaves DROP CONSTRAINT IF EXISTS leaves_leave_type_check;
