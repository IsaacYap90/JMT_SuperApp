# URGENT: PT Cancel Notification Debug Guide

## Problem

PT sessions are being cancelled successfully, but NO notifications appear in the coach's Notifications tab. Database shows ZERO "pt_cancelled" notifications.

---

## ✅ Fixes Applied

### Fix #1: Removed `.select()` from Notification Insert

**Issue:** All other notification inserts in ScheduleScreen don't use `.select()`, but Overview was using it.

**Before:**
```typescript
const { data: notifData, error: notifError } = await supabase
  .from('notifications')
  .insert(notifications)
  .select(); // ❌ This might be breaking the insert
```

**After:**
```typescript
const { error: notifError } = await supabase
  .from('notifications')
  .insert(notifications); // ✅ Matches ScheduleScreen pattern
```

### Fix #2: Enhanced Debug Logging

Added comprehensive logging to track exactly what's happening:

```typescript
console.log('=== NOTIFICATION DEBUG START ===');
console.log('[NOTIF DEBUG] PT session cancelled, preparing notifications');
console.log('[NOTIF DEBUG] Coach ID:', selectedPT.coach_id);
console.log('[NOTIF DEBUG] Member ID:', selectedPT.member_id);
console.log('[NOTIF DEBUG] Date string:', dateStr);
console.log('[NOTIF DEBUG] Member name:', selectedPT.member_name);
console.log('[NOTIF DEBUG] Notification payload:', JSON.stringify(notifications, null, 2));
console.log('[NOTIF DEBUG] About to insert notifications...');

const { error: notifError } = await supabase
  .from('notifications')
  .insert(notifications);

console.log('[NOTIF DEBUG] Insert complete');
console.log('[NOTIF DEBUG] Notification error:', notifError);

if (notifError) {
  console.error('[NOTIF DEBUG] ❌ NOTIFICATION INSERT FAILED');
  console.error('[NOTIF DEBUG] Full error object:', JSON.stringify(notifError, null, 2));
  console.error('[NOTIF DEBUG] Error code:', notifError.code);
  console.error('[NOTIF DEBUG] Error message:', notifError.message);
  console.error('[NOTIF DEBUG] Error details:', notifError.details);
  console.error('[NOTIF DEBUG] Error hint:', notifError.hint);
  Alert.alert('Warning', `PT cancelled but notification failed: ${notifError.message}`);
} else {
  console.log('[NOTIF DEBUG] ✅ Notifications sent successfully! (2 notifications inserted)');
}
console.log('=== NOTIFICATION DEBUG END ===');
```

### Fix #3: User Alert on Notification Failure

If notification insert fails, the user will now see an alert:
```
PT cancelled but notification failed: [error message]
```

This ensures you know immediately if notifications are failing.

---

## 🔍 Testing Instructions

### Step 1: Cancel a PT Session

1. **Login as Jeremy** (master_admin)
2. Navigate to **Admin Overview** tab
3. Tap any **scheduled PT session card**
4. Tap **"Cancel"** button
5. Confirm by tapping **"Yes"**

### Step 2: Check Browser Console

Open browser DevTools (F12 or Cmd+Option+I) and look for this output:

**✅ SUCCESS CASE (what you should see):**
```
[Admin Overview] Cancelling PT session: abc-123-def-456
[Admin Overview] Admin user ID: xyz-789-ghi-012
[Admin Overview] Admin role: master_admin
[Admin Overview] Update response: { data: [...], error: null }
=== NOTIFICATION DEBUG START ===
[NOTIF DEBUG] PT session cancelled, preparing notifications
[NOTIF DEBUG] Coach ID: coach-uuid-here
[NOTIF DEBUG] Member ID: member-uuid-here
[NOTIF DEBUG] Date string: 2026-02-05
[NOTIF DEBUG] Member name: John Doe
[NOTIF DEBUG] Notification payload: [
  {
    "user_id": "coach-uuid-here",
    "title": "PT Session Cancelled",
    "message": "PT session with John Doe on 2026-02-05 has been cancelled",
    "notification_type": "pt_cancelled",
    "reference_id": "abc-123-def-456",
    "reference_type": "pt_session",
    "is_read": false
  },
  {
    "user_id": "member-uuid-here",
    "title": "PT Session Cancelled",
    "message": "Your PT session on 2026-02-05 has been cancelled",
    "notification_type": "pt_cancelled",
    "reference_id": "abc-123-def-456",
    "reference_type": "pt_session",
    "is_read": false
  }
]
[NOTIF DEBUG] About to insert notifications...
[NOTIF DEBUG] Insert complete
[NOTIF DEBUG] Notification error: null
[NOTIF DEBUG] ✅ Notifications sent successfully! (2 notifications inserted)
=== NOTIFICATION DEBUG END ===
```

**❌ FAILURE CASE (what to look for):**
```
[NOTIF DEBUG] Notification error: { code: '...", message: '...', details: '...' }
[NOTIF DEBUG] ❌ NOTIFICATION INSERT FAILED
[NOTIF DEBUG] Full error object: { ... }
[NOTIF DEBUG] Error code: 42501 (or other error code)
[NOTIF DEBUG] Error message: "new row violates row-level security policy..."
```

### Step 3: Check for Alert

- **If notifications succeed:** You'll ONLY see "Success: PT session cancelled"
- **If notifications fail:** You'll see "Warning: PT cancelled but notification failed: [error]"

### Step 4: Verify in Database

Check Supabase notifications table:

```sql
SELECT
  id,
  user_id,
  title,
  message,
  notification_type,
  reference_id,
  reference_type,
  is_read,
  created_at
FROM notifications
WHERE notification_type = 'pt_cancelled'
ORDER BY created_at DESC
LIMIT 10;
```

**Expected:** You should see 2 new rows (one for coach, one for member) with the PT session ID as reference_id.

---

## 🐛 Common Issues to Check

### Issue 1: Coach ID or Member ID is Null/Undefined

**Check console output:**
```
[NOTIF DEBUG] Coach ID: undefined
[NOTIF DEBUG] Member ID: undefined
```

**If this happens:**
- The PTSession object is missing coach_id or member_id
- Check fetchData() function to ensure these fields are being fetched
- Check PTSession interface includes these fields

### Issue 2: RLS Policy Blocking Insert

**Error will show:**
```
Error code: 42501
Error message: "new row violates row-level security policy for table 'notifications'"
```

**Fix:** Run this SQL in Supabase to check/fix RLS:

```sql
-- Check existing INSERT policy
SELECT * FROM pg_policies
WHERE tablename = 'notifications'
AND cmd = 'INSERT';

-- If missing, create one:
CREATE POLICY "Anyone can insert notifications"
ON notifications
FOR INSERT
TO authenticated
WITH CHECK (true);
```

### Issue 3: Wrong Column Names

**Error will show:**
```
Error code: 42703
Error message: "column 'notification_type' does not exist"
```

**Fix:** Check actual notification table schema and update column names:

```sql
-- Check notification table columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'notifications';
```

If column is `type` not `notification_type`, update the insert code.

### Issue 4: Modal Closes Before Insert Completes

**Symptom:** Console shows notification insert started but never shows completion

**Check:** Ensure modal close happens AFTER notification insert:
- Line 780: `Alert.alert('Success', 'PT session cancelled');`
- Line 781: `setPTDetailVisible(false);`
- Line 782: `fetchData();`

These should all be AFTER the notification insert completes (line 761).

---

## 📋 Full Cancel Function Flow

Here's the exact order of operations:

1. **User clicks "Cancel" button** → Alert confirmation dialog appears
2. **User confirms "Yes"**
3. **Update PT session status** (lines 705-720)
   - Updates pt_sessions table
   - Sets status = 'cancelled'
   - Sets cancelled_by and cancelled_at
   - Throws error if update fails
4. **Format date** (lines 722-725)
   - Convert to Singapore timezone
   - Format as YYYY-MM-DD
5. **Build notification payload** (lines 735-754)
   - Create array with 2 notifications (coach + member)
6. **Insert notifications** (lines 759-778)
   - Insert into notifications table
   - Log success or error
   - Show alert if error occurs
7. **Close modal and refresh** (lines 780-782)
   - Show success alert
   - Close PT detail modal
   - Refresh overview data

**CRITICAL:** Steps 1-6 must complete BEFORE step 7.

---

## 🔧 Next Steps

### If Notifications Still Fail After This Fix:

1. **Check Console Logs:**
   - Copy the ENTIRE console output and share it
   - Look for the "NOTIFICATION DEBUG" section
   - Look for any error messages

2. **Check Database:**
   - Run the SQL query above to check notifications table
   - Check if ANY notifications exist (not just pt_cancelled)
   - Verify RLS policies on notifications table

3. **Check Supabase Dashboard:**
   - Go to Table Editor → notifications
   - Check recent inserts
   - Check table schema (verify column names)
   - Check RLS policies tab

4. **Test from ScheduleScreen:**
   - Cancel a PT from Schedule tab (not Overview)
   - Check if notification works there
   - If Schedule works but Overview doesn't, there's a code difference

---

## 📄 Files Modified

- ✅ `src/portals/admin/screens/OverviewScreen.tsx` (Lines 687-786)
  - Removed `.select()` from notification insert
  - Added extensive debug logging
  - Added user alert on notification failure

---

## Status: ⏳ READY FOR TESTING

All fixes have been applied. Test by cancelling a PT session and checking:
1. Browser console logs
2. User alerts (warning if notification fails)
3. Supabase notifications table

**Report back with:**
- Full console output from "=== NOTIFICATION DEBUG START ===" to "=== NOTIFICATION DEBUG END ==="
- Any error alerts shown
- Database query results
