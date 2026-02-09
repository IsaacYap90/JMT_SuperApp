# Feature Audit & Recommendations

## 1. Member Portal Audit
### Bugs & Gaps
- **ClassesScreen.tsx**: 
  - `enrolled_count` is hardcoded to `0` or uses a placeholder. Need a real RPC function `get_class_enrollment_counts` to fetch accurate numbers efficiently.
  - "Waitlist" logic is UI-only. No backend table or logic handles waitlists yet.
  - "Book" button logic assumes `class_enrollments` insert works, but doesn't check for double-booking on the client side (relying on DB constraints which might return generic errors).
- **PTSessionsScreen.tsx**:
  - `fetchCoaches` pulls all coaches but doesn't filter by "available for PT".
  - Cancellation logic (24h rule) relies on client-side time. Malicious users could spoof system time to bypass the check (though backend should validate this too).
- **ProfileScreen.tsx**:
  - "Renew Now" button is a placeholder `Alert`. No payment gateway integration.
  - "Change Password" sends a reset email. In-app password change UI is missing.

### UX Improvements
- **Pull-to-Refresh**: Added, but could be smoother with skeleton loaders instead of spinners.
- **Empty States**: "No classes scheduled" is text-only. Adding illustrations or "Browse other days" buttons would help.
- **Navigation**: No deep linking support (e.g., tap notification -> open specific class).

## 2. Web Admin Portal Audit
### Bugs & Gaps
- **Coaches Page**: 
  - List view pagination is missing. Will slow down if JMT scales to 50+ coaches.
  - No "Deactivate Coach" button. Only "Edit".
- **Schedule Page**: 
  - Likely missing a drag-and-drop interface for rescheduling classes (standard expectation for web admins).
- **Security**:
  - `create-user` Edge Function relies on `user_token` passed in body. Should ideally validate the session cookie directly if possible, or ensure the token isn't expired.

## 3. General Codebase Recommendations
### Security
- **RLS Policies**: Ensure `class_enrollments` RLS policy prevents User A from deleting User B's booking. (Need to verify SQL).
- **Edge Functions**: The `create-user` function is good, but we should add a `delete-user` function for full lifecycle management.

### Code Quality
- **Types**: `any` usage in `navigation` props (e.g., `(navigation as any).navigate`). Should define proper `NativeStackNavigationProp`.
- **Hardcoded Colors**: Some older screens might still use literal hex codes instead of `Colors.ts`.
- **Duplicate Logic**: `fetchNotifications` is duplicated across Coach, Admin, and Member screens. Should be a custom hook `useNotifications()`.

### Missing Features (High Value)
1.  **Waitlist System**: Actual backend queue for full classes. Auto-promote when someone cancels.
2.  **Stripe Integration**: For "Renew Membership" and "Buy PT Package".
3.  **Attendance QR Code**: Generate QR for member, Coach scans to verify (faster than manual list check).
4.  **Coach Availability**: Calendar for coaches to set "Blockout Dates" so PTs can't be booked then.

## 4. Priority Fixes (Recommended)
1.  **Refactor Notifications**: Extract to `useNotifications` hook to reduce code duplication.
2.  **Fix Enrollment Counts**: Implement `get_class_enrollment_counts` RPC function.
3.  **Add Deactivate Coach**: Vital for HR management.
