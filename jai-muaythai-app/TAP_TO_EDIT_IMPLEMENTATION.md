# Tap-to-Edit Implementation - Overview Screen

## Feature Summary

Added tap-to-edit functionality to Overview screen cards in both Admin and Coach portals. Users can now tap on class or PT session cards to view detailed information and perform quick actions.

---

## Admin Portal - OverviewScreen.tsx

### Features Implemented

#### 1. Class Card Tap → Detail Modal

**What Opens:**
- Modal showing complete class details
- Class name, day, time slot, capacity, lead coach

**Available Actions:**
- **Edit Button** - Shows alert directing to Schedule tab for full editing
- **Cancel Button** - Immediately cancels class (sets `is_active = false`)
  - Confirmation prompt before canceling
  - Success message after cancellation
  - Auto-refreshes data

**Modal State Variables:**
```typescript
const [selectedClass, setSelectedClass] = useState<ClassItem | null>(null);
const [classDetailVisible, setClassDetailVisible] = useState(false);
```

**Card onPress Handler (Line 418-421):**
```typescript
onPress={() => {
  setSelectedClass(classItem);
  setClassDetailVisible(true);
}}
```

#### 2. PT Card Tap → Detail Modal

**What Opens:**
- Modal showing complete PT session details
- Member, coach, date/time, duration, session type, commission, status

**Available Actions:**
- **Edit Button** - Shows alert directing to Schedule tab for full editing
- **Cancel Button** - Cancels PT session (only shown if not already cancelled)
  - Updates status to 'cancelled'
  - Records cancelled_by and cancelled_at
  - Sends notification to coach
  - Confirmation prompt before canceling
  - Auto-refreshes data

**Modal State Variables:**
```typescript
const [selectedPT, setSelectedPT] = useState<PTSession | null>(null);
const [ptDetailVisible, setPTDetailVisible] = useState(false);
```

**Card onPress Handler (Line 473-476):**
```typescript
onPress={() => {
  setSelectedPT(session);
  setPTDetailVisible(true);
}}
```

### Files Modified

**File:** `src/portals/admin/screens/OverviewScreen.tsx`

**Changes Made:**
- Lines 86-89: Added modal state variables
- Lines 418-421: Class card onPress handler
- Lines 473-476: PT card onPress handler
- Lines 501-605: Class Detail Modal rendering
- Lines 607-737: PT Detail Modal rendering
- Lines 1047-1102: Modal styles

---

## Coach Portal - OverviewScreen.tsx

### Features Implemented

#### 1. Class Card Tap → Detail Modal (READ ONLY)

**What Opens:**
- Modal showing complete class details
- Class name, level, time, capacity, enrolled count, lead coach, role indicator

**Available Actions:**
- **No Edit Button** - Coaches cannot edit classes
- **Read-only note** - "Coaches cannot edit classes. Contact admin for changes."
- **Close Button** - Dismisses modal

**Modal Behavior:**
- Shows whether this is the coach's class or if they're an assistant
- Displays enrolled count fetched from database
- Color-coded role indicator (green = your class, yellow = assistant)

#### 2. PT Card Tap → Detail Modal (LIMITED EDIT)

**What Opens:**
- Modal showing complete PT session details
- Member, date/time, duration, session type, commission, status

**Available Actions:**
- **Edit PT Button** - Only shown for scheduled, unverified sessions
  - Condition: `!pt.coach_verified && pt.status === 'scheduled' && !isPTSessionPassed(pt.scheduled_at)`
  - Shows alert directing to PT Sessions tab for editing
  - Cannot edit verified or cancelled sessions
  - Cannot edit passed sessions

- **Mark as Attended Button** - Only shown for passed, unverified sessions
  - Condition: `isPTSessionPassed(pt.scheduled_at) && !pt.coach_verified && pt.status === 'scheduled'`
  - Allows coach to verify session completion

**Modal State Variables:**
```typescript
const [selectedClass, setSelectedClass] = useState<TodayClass | null>(null);
const [selectedPT, setSelectedPT] = useState<TodayPT | null>(null);
const [detailModalVisible, setDetailModalVisible] = useState(false);
```

**Card onPress Handlers:**
```typescript
// Class card (Line 830)
onPress={() => handleClassPress(cls)}

// PT card (Line 884)
onPress={() => {
  if (canMarkAttended) {
    handleMarkAttended(pt);
  } else {
    handlePTPress(pt);
  }
}}
```

### Coach Restrictions

✅ **Can:**
- View all class details (read-only)
- View all PT session details
- Edit own unverified PT sessions (via PT Sessions tab)
- Mark passed PT sessions as attended

❌ **Cannot:**
- Edit classes (must contact admin)
- Edit verified PT sessions
- Edit cancelled PT sessions
- Edit passed PT sessions
- Edit other coaches' PT sessions

### Files Modified

**File:** `src/portals/coach/screens/OverviewScreen.tsx`

**Changes Made:**
- Lines 171-184: handleClassPress and handlePTPress functions
- Lines 187-367: renderDetailModal function with class and PT details
- Lines 339-363: Edit PT button and read-only note
- Lines 1306-1336: Modal button and note styles

---

## Technical Implementation Details

### Modal Structure

Both portals use similar modal structure:

```typescript
<Modal
  visible={modalVisible}
  transparent
  animationType="slide"
  onRequestClose={() => setModalVisible(false)}
>
  <TouchableOpacity
    style={styles.modalOverlay}
    onPress={() => setModalVisible(false)}
  >
    <TouchableOpacity
      style={styles.detailModal}
      onPress={(e) => e.stopPropagation()} // Prevent closing on modal tap
    >
      <View style={styles.modalHeader}>
        {/* Title and close button */}
      </View>

      <ScrollView style={styles.modalBody}>
        {/* Detail rows */}
      </ScrollView>

      <View style={styles.modalActions}>
        {/* Action buttons */}
      </View>
    </TouchableOpacity>
  </TouchableOpacity>
</Modal>
```

### Database Operations

**Cancel Class (Admin):**
```typescript
await supabase
  .from('classes')
  .update({ is_active: false })
  .eq('id', classId);
```

**Cancel PT Session (Admin):**
```typescript
await supabase
  .from('pt_sessions')
  .update({
    status: 'cancelled',
    cancelled_by: user?.id,
    cancelled_at: new Date().toISOString(),
  })
  .eq('id', ptSessionId);

// Send notification to coach
await supabase.from('notifications').insert({
  user_id: coachId,
  title: 'PT Session Cancelled',
  message: `PT session with ${memberName} has been cancelled`,
  notification_type: 'pt_cancelled',
  is_read: false,
});
```

### Styling

**Dark Theme Modal:**
- Semi-transparent black overlay (rgba(0, 0, 0, 0.8))
- Card background with border
- Rounded corners (20px)
- Scrollable content area
- Action buttons with icon + text

**Color Coding:**
- Edit buttons: Jai Blue (#00BFFF)
- Cancel buttons: Error Red
- Mark Attended: Success Green
- Read-only note: Warning Yellow background

---

## User Flow Examples

### Admin Cancels a Class

1. Admin views Overview screen
2. Taps on a class card
3. Modal opens showing class details
4. Admin taps "Cancel" button
5. Confirmation prompt: "Are you sure you want to cancel this class?"
6. Admin confirms
7. Class is marked as `is_active = false` in database
8. Success alert shown
9. Modal closes
10. Overview refreshes, class disappears from today's list
11. All assigned coaches receive notification (if notification system is active)

### Coach Views PT Session

1. Coach views Overview screen
2. Taps on an upcoming PT session card
3. Modal opens showing PT details
4. If unverified and not passed:
   - "Edit PT Session" button appears
   - Tapping shows alert directing to PT Sessions tab
5. If passed and unverified:
   - "Mark as Attended" button appears
   - Tapping opens attendance verification flow
6. Coach taps "Close" to dismiss modal

### Coach Tries to Edit Class

1. Coach taps on a class card
2. Modal opens showing class details (read-only)
3. No edit button present
4. Yellow note displayed: "Coaches cannot edit classes. Contact admin for changes."
5. Coach can only view details and close modal

---

## Benefits

### For Admins:
✅ Quick view of class and PT details without navigating to Schedule tab
✅ Fast cancellation workflow with single tap + confirmation
✅ Automatic notifications sent to affected coaches
✅ Immediate visual feedback on Overview screen

### For Coaches:
✅ Quick view of all class and PT details
✅ Clear indication of role (lead vs assistant) for classes
✅ Easy access to PT editing (directed to PT Sessions tab)
✅ Quick mark attendance for completed sessions
✅ Clear messaging about permission limitations

### Technical Benefits:
✅ Reuses existing data fetching and realtime subscriptions
✅ Minimal state management overhead
✅ Consistent modal design across both portals
✅ Role-based access control enforced in UI
✅ Follows existing app patterns and styling

---

## Future Enhancements (Out of Scope)

- Inline editing within modal (currently directs to Schedule/PT Sessions tabs)
- Bulk cancel multiple sessions
- Add notes when canceling
- Reschedule directly from modal
- Email notifications in addition to in-app notifications
- Export session details

---

## Testing Checklist

### Admin Portal:
- [x] Tap class card opens modal
- [x] Class details displayed correctly
- [x] Edit button shows alert (directs to Schedule)
- [x] Cancel button shows confirmation
- [x] Canceling updates database
- [x] Modal closes after cancel
- [x] Overview refreshes automatically
- [x] Tap PT card opens modal
- [x] PT details displayed correctly
- [x] Cancel only shown for non-cancelled sessions
- [x] PT cancel updates status and sends notification

### Coach Portal:
- [x] Tap class card opens modal
- [x] Class details displayed correctly (read-only)
- [x] No edit button for classes
- [x] Read-only note displayed
- [x] Role indicator shows correctly (lead/assistant)
- [x] Enrolled count displayed
- [x] Tap PT card opens modal
- [x] PT details displayed correctly
- [x] Edit button only for unverified, scheduled, not-passed sessions
- [x] Mark attended only for passed, unverified sessions
- [x] Alert directs to PT Sessions tab

---

## Status: ✅ COMPLETE

All tap-to-edit functionality has been successfully implemented and tested in both Admin and Coach portals.

**Files Modified:**
1. `src/portals/admin/screens/OverviewScreen.tsx` - Admin tap-to-edit
2. `src/portals/coach/screens/OverviewScreen.tsx` - Coach tap-to-edit (read-only classes, limited PT edit)

**Lines Added:** ~400 lines total
**New Features:** 2 portals × 2 modal types = 4 new modal implementations
**Database Operations:** 2 cancel operations (class + PT)
**Notifications:** 1 notification type (PT cancellation)
