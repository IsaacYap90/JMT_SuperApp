-- =====================================================================
-- SECURITY_RLS_FIX.sql  —  JMT super-app RLS hardening
-- Project: xioimcyqglfxqumvbqsg  (Jai Muay Thai — LIVE PROD)
-- Author: security audit remediation.  REVIEW BEFORE APPLYING.
-- Idempotent: safe to run more than once (DROP IF EXISTS + CREATE OR REPLACE).
--
-- Guiding facts established from the codebase:
--   * Service-role client (src/lib/supabase/admin.ts, src/lib/supabase/jai.ts,
--     and direct createClient(...SERVICE_ROLE_KEY) in webhooks/crons/calendar)
--     BYPASSES RLS. Anything written only via service-role needs NO write policy.
--   * Authenticated dashboard reads go through src/lib/supabase/server.ts
--     (user session). RLS applies as role `authenticated`.
--   * Public /book pages use server actions backed by the service-role client,
--     so NO table below actually needs anon access.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER) to check the caller's role WITHOUT
-- triggering RLS recursion.  A SELECT policy on `users` that queried
-- `users` inline would infinite-recurse (Postgres 42P17). These run as the
-- function owner (RLS-exempt, force_rls=false), so the inner read is safe.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.jmt_is_staff()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
      AND role IN ('coach', 'admin', 'master_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.jmt_is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
      AND role IN ('admin', 'master_admin')
  );
$$;

GRANT EXECUTE ON FUNCTION public.jmt_is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.jmt_is_admin() TO authenticated;

-- =====================================================================
-- 1. users
-- HOLE: "Enable read for authenticated users" SELECT USING(true) → any of
--   the 105 member accounts can read every user's PII + coach salaries.
-- APP READS via authenticated session: own profile (auth.uid()=id) on every
--   dashboard page; PLUS staff read others through joins — coach schedule
--   reads member:users on pt_sessions, coach leave reads reviewer:users,
--   admin leave page reads the coach roster (leave/page.tsx:60). All
--   multi-user roster reads on other pages use the service-role client.
-- FIX: members see only their own row; staff (coach/admin/master_admin)
--   keep full read so existing joins keep resolving.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Enable read for authenticated users" ON public.users;
DROP POLICY IF EXISTS "Users read own or staff read all" ON public.users;
CREATE POLICY "Users read own or staff read all"
  ON public.users
  FOR SELECT
  TO authenticated
  USING ( auth.uid() = id OR public.jmt_is_staff() );
-- (INSERT own / UPDATE own / "Admin can update users" left unchanged — correct.)

-- =====================================================================
-- 2. in_lieu_credits  (coach off-in-lieu leave credits)
-- HOLE: "Service role manages in_lieu_credits" cmd=ALL, roles={public},
--   USING(true) → anon + any authenticated user can READ and WRITE credits.
-- APP: writes only via service-role (leave.ts:351, admin.insert) → RLS-exempt.
--   read via authenticated session in leave/page.tsx:51 (coach needs own
--   balance, admin needs all).
-- FIX: SELECT = own row OR admin. No write policy (writes are service-role).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Service role manages in_lieu_credits" ON public.in_lieu_credits;
DROP POLICY IF EXISTS "Read own or admin all in_lieu_credits" ON public.in_lieu_credits;
CREATE POLICY "Read own or admin all in_lieu_credits"
  ON public.in_lieu_credits
  FOR SELECT
  TO authenticated
  USING ( coach_id = auth.uid() OR public.jmt_is_admin() );

-- =====================================================================
-- 3. class_coaches  (class ↔ coach assignment map)
-- HOLE: "Admins can manage class_coaches" ALL roles={public} USING(true)
--   WITH CHECK(true) → anyone (incl anon) can WRITE. Plus two SELECT
--   policies with USING(true) (public_read_class_coaches + "Coaches can
--   view class_coaches") that also expose anon reads.
-- APP: authenticated dashboard reads (schedule/page.tsx:106, page.tsx:171,
--   filtered coach_id=auth.uid()); admin schedule + ICS calendar read via
--   service-role. Writes are the admin-only ClassModal browser client
--   (class-modal.tsx insert/delete), UI-gated to isAdmin.
-- FIX: drop the public write + public/anon read policies. Keep authenticated
--   read (non-sensitive map). Admin insert/delete policies already exist and
--   enforce the ClassModal writes.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage class_coaches" ON public.class_coaches;
DROP POLICY IF EXISTS "public_read_class_coaches" ON public.class_coaches;
DROP POLICY IF EXISTS "Coaches can view class_coaches" ON public.class_coaches;
DROP POLICY IF EXISTS "Authenticated read class_coaches" ON public.class_coaches;
CREATE POLICY "Authenticated read class_coaches"
  ON public.class_coaches
  FOR SELECT
  TO authenticated
  USING ( true );
-- (Kept: "Admins can view/insert/delete class_coaches" — insert/delete gate writes.)

-- =====================================================================
-- 4. class_enrollments  (currently EMPTY, zero references in app code)
-- HOLE: "Allow all for authenticated" ALL roles={public} USING(true) →
--   anyone CRUD.
-- FIX: no client touches this table; lock to admins. Service-role (if ever
--   used server-side) bypasses RLS regardless. Add per-user self-enroll
--   later if that feature is built.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.class_enrollments;
DROP POLICY IF EXISTS "Admins manage class_enrollments" ON public.class_enrollments;
CREATE POLICY "Admins manage class_enrollments"
  ON public.class_enrollments
  FOR ALL
  TO authenticated
  USING ( public.jmt_is_admin() )
  WITH CHECK ( public.jmt_is_admin() );

-- =====================================================================
-- 5. coach_profiles  (zero references in app code)
-- HOLE: "System can update coach profiles" UPDATE roles={authenticated}
--   USING(true) → any member can update any coach profile.
-- FIX: drop it. Correct owner/admin policies already exist
--   ("Admins can insert/read/update coach profiles", "Users can view own
--   coach profile"). Nothing in app code writes this table.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "System can update coach profiles" ON public.coach_profiles;

-- =====================================================================
-- 6. coach_assignments  (currently EMPTY, zero references in app code)
-- HOLE: "Anyone can read assignments" SELECT roles={public} USING(true) →
--   anon read.
-- FIX: drop the anon read. Keep existing "Admin can manage assignments"
--   (master_admin). No app code reads it, so no read policy needed.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can read assignments" ON public.coach_assignments;

-- =====================================================================
-- 7. notifications
-- HOLE: "Anyone can insert notifications" + "System can insert notifications"
--   INSERT roles={authenticated} WITH CHECK(true) → any member can inject a
--   notification into any user's inbox (in-app phishing).
-- APP: notifications are created ONLY server-side via the service-role client
--   (notifications.ts:16 createNotification, pt.ts merge) → RLS-exempt.
--   Client only reads/updates OWN rows (getMyNotifications / markRead), which
--   the existing "Users can view/update own notifications" policies cover.
-- FIX: drop both permissive INSERT policies. No client insert path exists.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
-- (Kept: "Users can view own notifications", "Users can update own notifications".)

-- =====================================================================
-- POST-APPLY RESIDUAL / FOLLOW-UP (NOT fixed here — flagged):
--   * users: coaches (role=coach) can still read ALL COLUMNS of other users,
--     including salary fields (base_salary, hourly_rate, pt_commission_rate).
--     RLS is row-level and cannot hide columns, and coaches legitimately need
--     to read other users' rows for PT/schedule joins. Closing this requires a
--     column-restricted view or moving salary fields to a separate admin-only
--     table. This migration fully closes MEMBER access to all PII/salaries
--     (the 105-account hole); the coach→peer-salary exposure is a follow-up.
-- =====================================================================
