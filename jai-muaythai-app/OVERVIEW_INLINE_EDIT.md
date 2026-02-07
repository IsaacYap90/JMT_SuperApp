# Admin Overview - Inline Edit Modals

## Change Summary

Added inline edit modals for both classes and PT sessions in Admin Overview screen. Edit buttons now open edit forms directly instead of navigating to Schedule tab.

---

## User Flow

### Before:
1. Admin taps class card → Detail modal opens
2. Admin taps "Edit" → Alert: "Navigate to Schedule tab to edit this class"
3. Admin manually navigates to Schedule tab
4. Admin finds the class again
5. Admin edits class

### After:
1. Admin taps class card → Detail modal opens
2. Admin taps "Edit" → **Edit modal opens directly**
3. Admin makes changes
4. Admin saves → Updates immediately
5. Overview refreshes

**5 steps reduced to 4 steps** ✅

---

## Files Modified

**File:** `src/portals/admin/screens/OverviewScreen.tsx`

**Changes:**
- Added edit modal state variables
- Added form state variables (edit fields)
- Added handler functions (handleEditClass, handleEditPT, handleSaveClass, handleSavePT)
- Added edit modal rendering
- Added edit modal styles
- Updated Edit button actions

**Lines Added:** ~350 lines

---

## Features Implemented

### 1. Edit Class Modal

**Fields:**
- Class Name (text input)
- Start Time (HH:MM 24h)
- End Time (HH:MM 24h)
- Capacity (1-50)
- Assign Coaches (multi-select checkboxes)
- Lead Coach (radio select from assigned coaches)

**Validation:**
- Capacity must be 1-50
- Lead coach must be selected
- All fields required

**On Save:**
- Updates class in `classes` table
- Updates coach assignments in `class_coaches` table
- Removes old assignments, adds new ones
- Closes edit modal
- Closes detail modal
- Refreshes Overview data
- Shows success alert

### 2. Edit PT Session Modal

**Fields:**
- Member (radio select from all active members)
- Coach (radio select from all active coaches)
- Duration (minutes, numeric)
- Session Type (solo_package, solo_single, buddy, house_call)
- Commission (S$, numeric)

**Validation:**
- Duration must be 15-180 minutes
- All fields required

**On Save:**
- Updates PT session in `pt_sessions` table
- Closes edit modal
- Closes detail modal
- Refreshes Overview data
- Shows success alert

---

## State Variables Added

### Edit Modal State:
```typescript
const [editModalVisible, setEditModalVisible] = useState(false);
const [ptEditModalVisible, setPTEditModalVisible] = useState(false);
```

### Edit Class Form State:
```typescript
const [editName, setEditName] = useState('');
const [editCapacity, setEditCapacity] = useState('');
const [editStartTime, setEditStartTime] = useState('');
const [editEndTime, setEditEndTime] = useState('');
const [editDayOfWeek, setEditDayOfWeek] = useState('');
const [editDescription, setEditDescription] = useState('');
const [editLeadCoachId, setEditLeadCoachId] = useState('');
const [assignedCoaches, setAssignedCoaches] = useState<{id, full_name}[]>([]);
```

### Edit PT Form State:
```typescript
const [editPTCoachId, setEditPTCoachId] = useState('');
const [editPTMemberId, setEditPTMemberId] = useState('');
const [editPTScheduledAt, setEditPTScheduledAt] = useState('');
const [editPTDuration, setEditPTDuration] = useState('');
const [editPTSessionType, setEditPTSessionType] = useState('');
const [editPTCommission, setEditPTCommission] = useState('');
const [members, setMembers] = useState<any[]>([]);
```

---

## Handler Functions

### handleEditClass():
- Pre-fills form with selected class data
- Fetches assigned coaches from `class_coaches` table
- Opens edit modal

### toggleCoachAssignment(coach):
- Toggles coach selection in multi-select
- Updates assignedCoaches array

### handleSaveClass():
- Validates form data
- Updates class in database
- Deletes old coach assignments
- Inserts new coach assignments
- Shows success/error alerts
- Refreshes data

### handleEditPT():
- Pre-fills form with selected PT data
- Loads members list if not already loaded
- Opens edit modal

### handleSavePT():
- Validates form data
- Updates PT session in database
- Shows success/error alerts
- Refreshes data

---

## Edit Modal UI Components

### Class Edit Modal:
```
┌────────────────────────────────┐
│ Edit Class              ✕      │
├────────────────────────────────┤
│ Class Name: _______________   │
│ Start Time: __:__ (24h)       │
│ End Time:   __:__ (24h)       │
│ Capacity:   ___               │
│                                │
│ Assign Coaches:               │
│ ☑ Isaac Yap                   │
│ ☐ Shafiq                      │
│ ☐ Sasi                        │
│                                │
│ Lead Coach:                   │
│ ⦿ Isaac Yap                   │
│ ○ (others from assigned)      │
│                                │
│ [Save Changes]                │
│ [Cancel]                      │
└────────────────────────────────┘
```

### PT Edit Modal:
```
┌────────────────────────────────┐
│ Edit PT Session         ✕      │
├────────────────────────────────┤
│ Member:                       │
│ ○ John Doe                    │
│   john@example.com            │
│ ⦿ Jane Smith                  │
│   jane@example.com            │
│                                │
│ Coach:                        │
│ ⦿ Isaac Yap                   │
│ ○ Shafiq                      │
│                                │
│ Duration: ___ minutes         │
│                                │
│ Session Type:                 │
│ [Solo Package] [Solo Single]  │
│ [Buddy]        [House Call]   │
│                                │
│ Commission: S$ ___            │
│                                │
│ [Save Changes]                │
│ [Cancel]                      │
└────────────────────────────────┘
```

---

## Styling

### Modal Container:
- Background: Dark card (`Colors.cardBg`)
- Border: 1px solid dark border
- Border Radius: 20px
- Width: 90% (max 400px)
- Max Height: 80% (scrollable)

### Form Elements:
- Input Background: Black
- Input Border: Dark border
- Input Text: White
- Placeholder: Dark gray
- Label: White, bold

### Checkboxes/Radios:
- Active: Success green (checkboxes), Jai Blue (radios)
- Inactive: Light gray
- Ionicons used for visual elements

### Buttons:
- Save: Success green background, white text
- Cancel: Card background, white text with border

### Lists:
- Max Height: 150-200px (scrollable)
- Border: Dark border
- Rounded corners

---

## Database Operations

### Class Update:
```typescript
// Update class
await supabase.from('classes').update({
  name, capacity, start_time, end_time,
  day_of_week, description, lead_coach_id
}).eq('id', classId);

// Update coach assignments
await supabase.from('class_coaches').delete().eq('class_id', classId);
await supabase.from('class_coaches').insert(
  assignedCoaches.map(c => ({ class_id: classId, coach_id: c.id }))
);
```

### PT Update:
```typescript
await supabase.from('pt_sessions').update({
  coach_id, member_id, scheduled_at,
  duration_minutes, session_type, commission_amount
}).eq('id', ptSessionId);
```

---

## Benefits

### User Experience:
✅ **Faster editing** - No navigation required
✅ **Better workflow** - Stay in Overview screen
✅ **Context preserved** - Don't lose place in schedule
✅ **Immediate feedback** - See changes right away

### Code Quality:
✅ **Reusable patterns** - Similar to ScheduleScreen edit logic
✅ **Consistent styling** - Matches app design system
✅ **Proper validation** - Form validation included
✅ **Error handling** - Try-catch blocks with user alerts

### Functionality:
✅ **Full editing** - All fields editable
✅ **Coach management** - Multi-select + lead coach selection
✅ **Member selection** - Search/scroll through members
✅ **Session types** - All PT session types supported
✅ **Data refresh** - Auto-refresh after save

---

## Testing Checklist

### Edit Class:
- [ ] Tap class card → Detail modal opens
- [ ] Tap "Edit" → Edit modal opens
- [ ] Form pre-filled with current class data
- [ ] Assigned coaches loaded correctly
- [ ] Can assign/unassign coaches
- [ ] Can select lead coach (from assigned only)
- [ ] Save button updates database
- [ ] Success alert shown
- [ ] Modals close after save
- [ ] Overview refreshes with new data

### Edit PT:
- [ ] Tap PT card → Detail modal opens
- [ ] Tap "Edit" → Edit modal opens
- [ ] Form pre-filled with current PT data
- [ ] Members list loads correctly
- [ ] Can select different member
- [ ] Can select different coach
- [ ] Can change duration
- [ ] Can change session type
- [ ] Can change commission
- [ ] Save button updates database
- [ ] Success alert shown
- [ ] Modals close after save
- [ ] Overview refreshes with new data

### Error Handling:
- [ ] Invalid capacity shows error
- [ ] Missing lead coach shows error
- [ ] Invalid duration shows error
- [ ] Database errors shown to user
- [ ] Form doesn't close on error

---

## Status: ✅ COMPLETE

Edit Class and Edit PT modals now open inline on Admin Overview screen instead of navigating to Schedule tab.

**Next Steps:**
- Test editing classes with different coach assignments
- Test editing PT sessions with all session types
- Verify data refreshes correctly after edits
- Verify no navigation occurs (stays on Overview)
