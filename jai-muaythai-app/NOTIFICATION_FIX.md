# PT Cancellation Notification Fix

## Problem

When admin cancels a PT session from Overview screen, notifications were NOT being sent to coach or member.

## Root Causes Found

### 1. ❌ Missing `member_id` in PTSession Interface

**File:** `src/portals/admin/screens/OverviewScreen.tsx` (Line 35-47)

**Issue:** The PTSession interface was missing the `member_id` field, even though it was being queried from the database.

**Fix:**
```typescript
interface PTSession {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  member_id: string; // ✅ ADDED
  member_name: string;
  coach_name: string;
  coach_id: string;
  session_type: string;
  commission_amount: number | null;
  coach_verified: boolean;
  member_verified: boolean;
}
```

### 2. ❌ Missing `member_id` in Data Mapping

**File:** `src/portals/admin/screens/OverviewScreen.tsx` (Line 199-211)

**Issue:** When mapping PT session data, `member_id` was not included in the final object, only `member_name` was mapped.

**Before:**
```typescript
const sessions: PTSession[] = ptData.map(item => ({
  id: item.id,
  // ... other fields
  coach_id: item.coach_id,
  member_name: (item.member as any)?.full_name || 'Unknown Member',
  coach_name: (item.coach as any)?.full_name || 'Unknown Coach',
  // ❌ member_id was MISSING
}));
```

**After:**
```typescript
const sessions: PTSession[] = ptData.map(item => ({
  id: item.id,
  // ... other fields
  coach_id: item.coach_id,
  member_id: item.member_id, // ✅ ADDED
  member_name: (item.member as any)?.full_name || 'Unknown Member',
  coach_name: (item.coach as any)?.full_name || 'Unknown Coach',
}));
```

### 3. ❌ Incomplete Notification Logic

**File:** `src/portals/admin/screens/OverviewScreen.tsx` (Line 720-733)

**Issues:**
- Only sent notification to **coach**, not to **member**
- Missing `reference_id` and `reference_type` fields
- No date formatting in message (just showed member name)

**Before:**
```typescript
await supabase.from('notifications').insert({
  user_id: selectedPT.coach_id,
  title: 'PT Session Cancelled',
  message: `PT session with ${selectedPT.member_name} has been cancelled`,
  notification_type: 'pt_cancelled',
  is_read: false,
  // ❌ No member notification
  // ❌ No reference_id
  // ❌ No reference_type
  // ❌ No date in message
});
```

**After:**
```typescript
// Format date in Singapore timezone
const scheduledDate = new Date(selectedPT.scheduled_at);
const sgDate = new Date(scheduledDate.getTime() + 8 * 60 * 60 * 1000);
const dateStr = sgDate.toISOString().split('T')[0];

// Send notifications to BOTH coach and member
const notifications = [
  {
    user_id: selectedPT.coach_id,
    title: 'PT Session Cancelled',
    message: `PT session with ${selectedPT.member_name} on ${dateStr} has been cancelled`,
    notification_type: 'pt_cancelled',
    reference_id: selectedPT.id,
    reference_type: 'pt_session',
    is_read: false,
  },
  {
    user_id: selectedPT.member_id, // ✅ Member gets notified too
    title: 'PT Session Cancelled',
    message: `Your PT session on ${dateStr} has been cancelled`,
    notification_type: 'pt_cancelled',
    reference_id: selectedPT.id,
    reference_type: 'pt_session',
    is_read: false,
  },
];

await supabase.from('notifications').insert(notifications);
```

---

## Changes Summary

### File: `src/portals/admin/screens/OverviewScreen.tsx`

1. **Line 35-47:** Added `member_id: string` to PTSession interface
2. **Line 209:** Added `member_id: item.member_id` to data mapping
3. **Line 720-747:** Replaced single notification with dual notifications (coach + member)
   - Added Singapore timezone date formatting
   - Added `reference_id` and `reference_type` fields
   - Added date to message
   - Send to both coach and member

### Enhanced Console Logging

Added comprehensive logging to track notification sending:

```typescript
console.log('[Admin Overview] PT session cancelled, sending notifications to coach and member');
console.log('[Admin Overview] Coach ID:', selectedPT.coach_id);
console.log('[Admin Overview] Member ID:', selectedPT.member_id);

// After insert
if (notifError) {
  console.error('[Admin Overview] Notification error:', notifError);
} else {
  console.log('[Admin Overview] Notifications sent successfully to coach and member');
}
```

---

## Testing Steps

### Test 1: Cancel PT from Admin Overview

1. **Login as Jeremy** (master_admin)
2. Navigate to **Overview** tab
3. Find a scheduled PT session card
4. **Tap the PT card** → Detail modal opens
5. **Tap "Cancel"** → Confirmation dialog appears
6. **Tap "Yes"** → Check console logs

**Expected Console Output:**
```
[Admin Overview] Cancelling PT session: <pt-id>
[Admin Overview] Admin user ID: <jeremy-id>
[Admin Overview] Admin role: master_admin
[Admin Overview] Update response: { data: [...], error: null }
[Admin Overview] PT session cancelled, sending notifications to coach and member
[Admin Overview] Coach ID: <coach-id>
[Admin Overview] Member ID: <member-id>
[Admin Overview] Notifications sent successfully to coach and member
```

### Test 2: Verify Coach Receives Notification

1. **Login as the coach** assigned to the cancelled PT
2. Navigate to **Notifications** tab
3. **Expected:**
   - New notification appears
   - Title: "PT Session Cancelled"
   - Message: "PT session with [member name] on [date] has been cancelled"
   - Notification has reference link to PT session

### Test 3: Verify Member Receives Notification

1. **Login as the member** enrolled in the cancelled PT
2. Navigate to **Notifications** tab
3. **Expected:**
   - New notification appears
   - Title: "PT Session Cancelled"
   - Message: "Your PT session on [date] has been cancelled"
   - Notification has reference link to PT session

### Test 4: Verify Database Records

Check notifications table in Supabase:

```sql
SELECT
  user_id,
  title,
  message,
  notification_type,
  reference_id,
  reference_type,
  is_read,
  created_at
FROM notifications
WHERE reference_id = '<CANCELLED_PT_SESSION_ID>'
ORDER BY created_at DESC;
```

**Expected Result:** 2 rows
- One for coach
- One for member
- Both with `notification_type = 'pt_cancelled'`
- Both with correct `reference_id` and `reference_type`

---

## Comparison with ScheduleScreen

The Overview screen now matches the ScheduleScreen notification logic:

| Feature | ScheduleScreen | OverviewScreen (Before) | OverviewScreen (After) |
|---------|---------------|-------------------------|------------------------|
| Coach notification | ✅ Yes | ✅ Yes | ✅ Yes |
| Member notification | ✅ Yes | ❌ No | ✅ Yes |
| reference_id | ✅ Yes | ❌ No | ✅ Yes |
| reference_type | ✅ Yes | ❌ No | ✅ Yes |
| Date in message | ✅ Yes | ❌ No | ✅ Yes |
| Singapore timezone | ✅ Yes | ❌ No | ✅ Yes |

---

## Related Files

- ✅ `src/portals/admin/screens/OverviewScreen.tsx` - Fixed notification logic
- 📋 `src/portals/admin/screens/ScheduleScreen.tsx` - Reference implementation (already working)
- 📄 `NOTIFICATION_FIX.md` - This documentation

---

## Status: ✅ FIXED

All notification issues have been resolved. The Overview screen now sends notifications to both coach and member when admin cancels a PT session, matching the behavior of the Schedule screen.

**Lines Modified:** ~50 lines
**Files Modified:** 1 file
**Bug Severity:** High (users not receiving important notifications)
**Fix Complexity:** Medium (required interface, mapping, and logic changes)
