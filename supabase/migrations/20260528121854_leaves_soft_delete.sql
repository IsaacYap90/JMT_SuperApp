-- Soft-delete for leaves (fixes the admin-cancel-with-no-notification + no-audit-trail bug).
-- cancelLeave now sets deleted_at/deleted_by instead of a hard DELETE, and fires a
-- "Leave Cancelled by Admin" notification when an admin reverses an approved leave.
-- All leave list / calendar / briefing queries filter `deleted_at IS NULL`.
alter table leaves add column if not exists deleted_at timestamptz;
alter table leaves add column if not exists deleted_by uuid;
