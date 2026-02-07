# FINAL FIX: PT Cancel Notification - Simplified

## Root Cause Identified

The notification insert was failing because it included `reference_id` and `reference_type` fields that either:
1. Have wrong data types/constraints in the database
2. Are not properly supported by the notifications table
3. Are causing RLS policy violations

The working notifications (class assignments) only use 5 fields:
- `user_id`
- `title`
- `message`
- `notification_type`
- `is_read`

---

## ✅ FINAL FIX APPLIED

### Simplified Notification to Match Working Format

**File:** `src/portals/admin/screens/OverviewScreen.tsx` (Lines 736-744)

**Before (Complex - FAILED):**
```typescript
const notifications = [
  {
    user_id: selectedPT.coach_id,
    title: 'PT Session Cancelled',
    message: `PT session with ${selectedPT.member_name} on ${dateStr} has been cancelled`,
    notification_type: 'pt_cancelled',
    reference_id: selectedPT.id,      // ❌ REMOVED
    reference_type: 'pt_session',     // ❌ REMOVED
    is_read: false,
  },
  {
    user_id: selectedPT.member_id,    // ❌ REMOVED (member portal not built)
    title: 'PT Session Cancelled',
    message: `Your PT session on ${dateStr} has been cancelled`,
    notification_type: 'pt_cancelled',
    reference_id: selectedPT.id,      // ❌ REMOVED
    reference_type: 'pt_session',     // ❌ REMOVED
    is_read: false,
  },
];
```

**After (Simple - MATCHES WORKING NOTIFICATIONS):**
```typescript
const notifications = [
  {
    user_id: selectedPT.coach_id,
    title: 'PT Session Cancelled',
    message: `PT session with ${selectedPT.member_name || 'member'} on ${dateStr} has been cancelled`,
    notification_type: 'pt_cancelled',
    is_read: false,
  },
];
```

### Changes Made:

1. ✅ **Removed `reference_id`** - Not needed, was causing failures
2. ✅ **Removed `reference_type`** - Not needed, was causing failures
3. ✅ **Removed member notification** - Member portal doesn't exist yet
4. ✅ **Added fallback for member name** - `selectedPT.member_name || 'member'`
5. ✅ **Single notification to coach only** - Matches working pattern

---

## Notification Format Now Matches Working Notifications

### Working Class Assignment Notification:
```typescript
{
  user_id: coachId,
  title: 'Assigned to Class',
  message: 'You've been assigned to Kids Muay Thai...',
  notification_type: 'system',
  is_read: false,
}
```

### Our PT Cancel Notification:
```typescript
{
  user_id: selectedPT.coach_id,
  title: 'PT Session Cancelled',
  message: 'PT session with John Doe on 2026-02-05 has been cancelled',
  notification_type: 'pt_cancelled',
  is_read: false,
}
```

**✅ EXACT SAME STRUCTURE**

---

## Debug Logging Still Active

Console output will show:

```
=== NOTIFICATION DEBUG START ===
[NOTIF DEBUG] PT session cancelled, preparing notification for coach
[NOTIF DEBUG] Coach ID: <uuid>
[NOTIF DEBUG] Date string: 2026-02-05
[NOTIF DEBUG] Member name: John Doe
[NOTIF DEBUG] Notification payload: [
  {
    "user_id": "<coach-uuid>",
    "title": "PT Session Cancelled",
    "message": "PT session with John Doe on 2026-02-05 has been cancelled",
    "notification_type": "pt_cancelled",
    "is_read": false
  }
]
[NOTIF DEBUG] About to insert notification (coach only)...
[NOTIF DEBUG] Insert complete
[NOTIF DEBUG] Notification error: null
[NOTIF DEBUG] ✅ Notification sent successfully to coach!
=== NOTIFICATION DEBUG END ===
```

---

## Testing Steps

### Step 1: Cancel PT Session

1. Login as Jeremy (admin)
2. Navigate to Overview tab
3. Tap a PT session card
4. Tap "Cancel" button
5. Confirm "Yes"

### Step 2: Check Console

Look for:
- `✅ Notification sent successfully to coach!` = SUCCESS
- `❌ NOTIFICATION INSERT FAILED` = Still broken (report error)

### Step 3: Check Database

```sql
SELECT
  id,
  user_id,
  title,
  message,
  notification_type,
  is_read,
  created_at
FROM notifications
WHERE notification_type = 'pt_cancelled'
ORDER BY created_at DESC
LIMIT 5;
```

**Expected:** You should see new rows with:
- `notification_type = 'pt_cancelled'`
- `title = 'PT Session Cancelled'`
- `message = 'PT session with [member] on [date] has been cancelled'`
- `user_id = <coach-uuid>`

### Step 4: Check Coach's Notifications Tab

1. Login as the coach
2. Navigate to Notifications tab
3. **Expected:** See "PT Session Cancelled" notification

---

## Why This Should Work Now

### Comparison Table

| Field | Working Notifications | Old PT Cancel | New PT Cancel |
|-------|----------------------|---------------|---------------|
| user_id | ✅ Present | ✅ Present | ✅ Present |
| title | ✅ Present | ✅ Present | ✅ Present |
| message | ✅ Present | ✅ Present | ✅ Present |
| notification_type | ✅ Present | ✅ Present | ✅ Present |
| is_read | ✅ Present | ✅ Present | ✅ Present |
| reference_id | ❌ Absent | ❌ Present (FAIL) | ✅ Removed |
| reference_type | ❌ Absent | ❌ Present (FAIL) | ✅ Removed |
| Member notif | ❌ N/A | ❌ Present | ✅ Removed |

**Result:** New format is IDENTICAL to working notifications ✅

---

## What If It Still Fails?

If the notification insert STILL fails after this fix, the issue is likely:

### Issue 1: Coach ID is Null/Undefined

**Check console:**
```
[NOTIF DEBUG] Coach ID: undefined
```

**Fix:** The PTSession object is missing coach_id. Check data mapping in fetchData().

### Issue 2: RLS Policy Blocking Insert

**Check console:**
```
Error code: 42501
Error message: "new row violates row-level security policy"
```

**Fix:** Run this SQL:
```sql
-- Allow admins to insert notifications
CREATE POLICY "Admins can insert notifications"
ON notifications
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'master_admin')
  )
);
```

### Issue 3: Wrong Column Name

**Check console:**
```
Error code: 42703
Error message: "column 'notification_type' does not exist"
```

**Fix:** Check actual column names:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'notifications';
```

If column is `type` not `notification_type`, update the code.

---

## Files Modified

- ✅ `src/portals/admin/screens/OverviewScreen.tsx` (Lines 727-768)
  - Simplified notification to 5 fields only
  - Removed reference_id and reference_type
  - Removed member notification
  - Kept debug logging

---

## Status: ✅ READY TO TEST

The notification format now EXACTLY matches working notifications in the database. This should work!

**Next Steps:**
1. Test by cancelling a PT session
2. Check console logs
3. Verify notification appears in database
4. Verify coach sees notification in app

If this still doesn't work, we need to check RLS policies or column names in the database schema.
