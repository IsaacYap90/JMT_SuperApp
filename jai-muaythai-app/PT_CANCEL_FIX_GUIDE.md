# PT Session Cancel Bug - Fix Guide

## Problem

Admin (Jeremy) taps a PT card in Overview screen, clicks Cancel, confirms, but the PT session does NOT get cancelled. Nothing happens.

## Root Cause

The Supabase UPDATE query was NOT checking for errors. If the update failed (e.g., due to RLS policy issues), the code would silently continue and show "Success" even though nothing was updated.

**Additionally**, the RLS UPDATE policy may be missing the `WITH CHECK` clause, which is required for UPDATE operations to work correctly.

---

## Fix #1: Code Changes ✅ COMPLETE

### Updated: `src/portals/admin/screens/OverviewScreen.tsx` (Lines 695-745)

**Before (Silent Failure):**
```typescript
await supabase
  .from('pt_sessions')
  .update({
    status: 'cancelled',
    cancelled_by: user?.id,
    cancelled_at: new Date().toISOString(),
  })
  .eq('id', selectedPT.id);
// No error checking! ❌
```

**After (Proper Error Handling):**
```typescript
console.log('[Admin Overview] Cancelling PT session:', selectedPT.id);
console.log('[Admin Overview] Admin user ID:', user?.id);
console.log('[Admin Overview] Admin role:', user?.role);

const { data, error } = await supabase
  .from('pt_sessions')
  .update({
    status: 'cancelled',
    cancelled_by: user?.id,
    cancelled_at: new Date().toISOString(),
  })
  .eq('id', selectedPT.id)
  .select(); // ✅ Returns data to verify

console.log('[Admin Overview] Update response:', { data, error });

if (error) {
  console.error('[Admin Overview] Update error:', error);
  throw error; // ✅ Throw error if update fails
}
```

**What This Does:**
- ✅ Logs PT session ID, admin user ID, and admin role
- ✅ Captures the `error` response from Supabase
- ✅ Throws error if update fails (shows error alert to user)
- ✅ Adds `.select()` to return updated data for verification
- ✅ Logs full response for debugging

---

## Fix #2: Database RLS Policy ⚠️ NEEDS TO BE RUN

### Issue: Missing WITH CHECK Clause

The UPDATE policy in `supabase/fix_admin_rls_policies.sql` has only a `USING` clause but is missing the `WITH CHECK` clause.

**PostgreSQL RLS Rules:**
- `USING` clause: Determines **which rows** can be updated
- `WITH CHECK` clause: Determines **what values** can be set

For UPDATE operations, you need **BOTH** clauses.

### Run This SQL in Supabase

File: `supabase/fix_pt_update_policy.sql`

```sql
-- Drop existing UPDATE policy
DROP POLICY IF EXISTS "Admins and coaches can update PT sessions" ON pt_sessions;

-- Recreate with both USING and WITH CHECK clauses
CREATE POLICY "Admins and coaches can update PT sessions"
ON pt_sessions
FOR UPDATE
TO authenticated
USING (
  -- Which rows can be updated
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'master_admin')
  )
  OR
  coach_id = auth.uid()
)
WITH CHECK (
  -- What values can be set (same as USING for this case)
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'master_admin')
  )
  OR
  coach_id = auth.uid()
);
```

**How to Run:**
1. Go to Supabase Dashboard → SQL Editor
2. Paste the SQL above
3. Click "Run"
4. Verify output shows "Success"

---

## Diagnostic Steps

### Step 1: Check Current Policies

Run this in Supabase SQL Editor:

```sql
SELECT
  policyname,
  cmd,
  CASE
    WHEN qual IS NOT NULL THEN 'Has USING clause ✅'
    ELSE 'No USING clause ❌'
  END as using_clause,
  CASE
    WHEN with_check IS NOT NULL THEN 'Has WITH CHECK clause ✅'
    ELSE 'No WITH CHECK clause ❌'
  END as with_check_clause
FROM pg_policies
WHERE tablename = 'pt_sessions'
AND cmd = 'UPDATE';
```

**Expected Result:**
| policyname | cmd | using_clause | with_check_clause |
|-----------|-----|--------------|-------------------|
| Admins and coaches can update PT sessions | UPDATE | Has USING clause ✅ | Has WITH CHECK clause ✅ |

If "with_check_clause" says "No WITH CHECK clause ❌", that's the problem!

### Step 2: Check Jeremy's User Record

```sql
SELECT
  id,
  email,
  role,
  is_active
FROM users
WHERE email = 'jeremy@jmt.com';
```

**Expected Result:**
- role: `master_admin` or `admin`
- is_active: `true`

### Step 3: Test Update Directly

While logged in as Jeremy in Supabase, try updating a PT session directly:

```sql
UPDATE pt_sessions
SET
  status = 'cancelled',
  cancelled_by = auth.uid(),
  cancelled_at = NOW()
WHERE id = '<PASTE_ACTUAL_PT_SESSION_ID_HERE>'
RETURNING *;
```

**If this works:**
- RLS policy is correct
- Issue was just the missing error handling in code (already fixed)

**If this fails:**
- Check error message
- Verify Jeremy's user ID matches auth.uid()
- Verify RLS policy has WITH CHECK clause

---

## Testing the Fix

### Test 1: Cancel PT from Admin Overview

1. **Login as Jeremy** (master_admin)
2. Navigate to **Overview** tab
3. Find a PT session card (status = 'scheduled')
4. **Tap the PT card** → Detail modal opens
5. **Tap "Cancel" button** → Confirmation dialog appears
6. **Tap "Yes"** → Watch for:
   - Console logs showing the PT session ID, admin ID, and role
   - Console log showing update response
   - Success alert: "PT session cancelled"
   - Modal closes
   - Overview refreshes
   - PT session disappears or shows as cancelled

### Test 2: Check Console Output

With the new console logs, you should see:
```
[Admin Overview] Cancelling PT session: abc-123-def-456
[Admin Overview] Admin user ID: xyz-789-ghi-012
[Admin Overview] Admin role: master_admin
[Admin Overview] Update response: { data: [...], error: null }
[Admin Overview] PT session cancelled, sending notification to coach: coach-id-here
```

### Test 3: Verify Database

After cancelling, check in Supabase:

```sql
SELECT
  id,
  status,
  cancelled_by,
  cancelled_at,
  member_id,
  coach_id
FROM pt_sessions
WHERE id = '<CANCELLED_SESSION_ID>'
```

**Expected Result:**
- status: `'cancelled'`
- cancelled_by: Jeremy's user ID
- cancelled_at: Current timestamp

### Test 4: Check Notification

Verify coach received notification:

```sql
SELECT
  user_id,
  title,
  message,
  created_at
FROM notifications
WHERE reference_id = '<CANCELLED_SESSION_ID>'
ORDER BY created_at DESC
LIMIT 1;
```

**Expected Result:**
- title: "PT Session Cancelled"
- message: "PT session with [member name] has been cancelled"

---

## If It Still Doesn't Work

### Debug Checklist

1. **Check Console Logs:**
   - Do you see `[Admin Overview] Cancelling PT session: ...`?
   - What does the update response show?
   - Any error messages?

2. **Check RLS Policy:**
   - Run diagnostic SQL (see Step 1 above)
   - Verify WITH CHECK clause exists

3. **Check Jeremy's Role:**
   - Run diagnostic SQL (see Step 2 above)
   - Verify role is 'master_admin' or 'admin'

4. **Temporary Test - Disable RLS:**
   ```sql
   ALTER TABLE pt_sessions DISABLE ROW LEVEL SECURITY;
   -- Try cancelling from app
   -- If it works, RLS is the issue
   -- Re-enable RLS:
   ALTER TABLE pt_sessions ENABLE ROW LEVEL SECURITY;
   ```

5. **Check Supabase Auth:**
   - Verify Jeremy is logged in
   - Check auth token is valid
   - Try logging out and back in

---

## Files Modified

1. ✅ `src/portals/admin/screens/OverviewScreen.tsx` - Added error handling and logging
2. ⚠️ `supabase/fix_pt_update_policy.sql` - RLS policy fix (NEEDS TO BE RUN)
3. 📄 `supabase/diagnose_pt_cancel.sql` - Diagnostic queries
4. 📄 `PT_CANCEL_FIX_GUIDE.md` - This guide

---

## Summary

**Problem:** PT cancellation from Admin Overview screen failed silently

**Cause:**
1. ❌ Missing error handling in Supabase update query
2. ❌ Possibly missing WITH CHECK clause in RLS UPDATE policy

**Solution:**
1. ✅ Added proper error handling and logging to code
2. ⚠️ Run `fix_pt_update_policy.sql` in Supabase to fix RLS policy

**Next Steps:**
1. Run the SQL fix in Supabase
2. Test cancelling a PT session from Admin Overview
3. Check console logs to verify it works
4. Report back with console output if it still fails
