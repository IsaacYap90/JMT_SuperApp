# JMT Super App — Code Review

**Date:** 2026-02-08  
**Reviewer:** Automated Code Review  
**Codebase:** `jai-muaythai-app/` (React Native + Expo 54 + Supabase)

---

## Executive Summary

The app has a **well-built Admin and Coach portal** with a dark futuristic UI theme, real-time notifications, PT session management, payslip generation, and leave management. However, it has **critical security issues**, the **Member portal is completely unimplemented** (just placeholder screens), there are **37+ TypeScript compilation errors**, and several architectural concerns need addressing before launch.

---

## 🔴 Critical Issues (Must Fix Before Launch)

### 1. SECURITY: Supabase Admin Client Uses Anon Key — Cannot Create Users

**Files:** `src/shared/services/supabaseAdmin.ts`

The `supabaseAdmin` client is intended for admin operations like creating users, but it uses the **anon key** instead of the **service role key**:

```typescript
// supabaseAdmin.ts
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
export const supabaseAdmin = createClient(supabaseUrl, supabaseAnonKey, { ... });
```

In `CoachesScreen.tsx` line ~310, it calls:
```typescript
await supabaseAdmin.auth.admin.createUser({ ... });
```

**Problem:** `auth.admin.createUser()` requires the **service role key**. With the anon key, this will always fail with a permissions error. The "Add Coach" feature is broken.

**Fix:** This is tricky — you **cannot** embed the service role key in a mobile app (it would give full DB access to anyone who decompiles the APK). You need a **Supabase Edge Function** or backend endpoint to handle user creation securely.

### 2. SECURITY: Supabase Keys Hardcoded in Source Code

**Files:** `src/shared/services/supabase.ts`, `src/shared/services/supabaseAdmin.ts`

The Supabase URL and anon key are hardcoded directly in source files:
```typescript
const supabaseUrl = 'https://xioimcyqglfxqumvbqsg.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIs...';
```

**Impact:** The anon key is designed to be public and is safe in client apps **IF** your RLS policies are solid. However:
- These will be committed to git history forever
- Environment variables (via `expo-constants` or `.env`) are best practice
- Makes it hard to rotate keys

**Fix:** Use environment variables via `app.config.js` + `expo-constants` or `react-native-dotenv`.

### 3. SECURITY: Dev Login Creates Users with Known Passwords & Upserts Roles

**File:** `src/screens/LoginScreen.tsx` (the OLD login screen, lines 63-100)

The dev login function is **dangerous in production**:
```typescript
const devLogin = async (role: 'member' | 'coach' | 'admin' | 'master_admin') => {
  await supabase.auth.signUp({
    email: testEmail,
    password: 'testpassword123',
  });
  await supabase.from('users').upsert({
    id: authData.user?.id,
    role: role,  // ← Any user could become master_admin!
  }, { onConflict: 'id' });
};
```

**Impact:** If this code ships to production, AND RLS allows role upserts, anyone could elevate themselves to `master_admin`.

**Fix:** Remove dev login entirely, or guard with `__DEV__` flag. The newer `shared/screens/LoginScreen.tsx` also has dev login buttons (lines 152-180) with hardcoded test credentials.

### 4. SECURITY: No Role Validation on Client-Side Admin Operations

The app relies entirely on the `user.role` field from the database to gate UI access, but there's no server-side validation that the currently authenticated user actually has the role they claim when performing write operations through Supabase.

For example, in `CoachesScreen.tsx`, the "Add Coach" feature checks `isMasterAdmin` on the UI level only. If RLS policies are misconfigured, any authenticated user could insert/update records.

**Mitigation:** The RLS policies in `fix_admin_rls_policies.sql` do check roles via `auth.uid()` lookups. Ensure ALL tables have RLS enabled and tested.

### 5. Member Portal is Completely Unimplemented

**File:** `src/navigation/MemberNavigator.tsx`

The entire member portal consists of **3 placeholder screens** with just a centered text label:

```typescript
const ClassesScreen = () => (
  <View style={styles.screen}>
    <Text style={styles.text}>Classes</Text>
  </View>
);
const PTScreen = () => ( /* same */ );
const MembershipScreen = () => ( /* same */ );
```

**Impact:** Members who log in will see a completely empty app. This is a show-stopper for any public launch.

### 6. 37+ TypeScript Compilation Errors

Running `npx tsc --noEmit` produces 37+ errors across multiple files. Key categories:

| File | Error | Severity |
|------|-------|----------|
| `OverviewScreen.tsx:1275` | Missing style `coachRadio` | Runtime crash potential |
| `OverviewScreen.tsx:1380` | Missing style `modalCloseButton` | Runtime crash potential |
| `CoachPTSessionsScreen.tsx:301` | `.push()` called on string | **Will crash at runtime** |
| `CoachPTSessionsScreen.tsx:261` | Redeclared `today` variable | Logic bug |
| `ScheduleScreen.tsx:731` | Undefined `editName`, `editStartTime` | **Will crash at runtime** |
| `ScheduleScreen.tsx:4451+` | Duplicate style properties | Last wins, visual bugs |
| `AdminPTPaymentsScreen.tsx:50` | `profile` not on AuthContextType | **Will crash at runtime** |
| Multiple files | `lead_coach` typed as object but Supabase returns array | Type mismatch, potential `.full_name` crashes |
| `FuturisticUI.tsx:46` | `string[]` not assignable to LinearGradient colors | Type error |

**Most Critical Runtime Crashes:**
- `CoachPTSessionsScreen.tsx:301` — calling `.push()` on a string will crash
- `ScheduleScreen.tsx:731` — referencing undefined variables `editName` and `editStartTime`
- `AdminPTPaymentsScreen.tsx:50` — accessing `.profile` which doesn't exist on auth context

---

## 🟡 Important Issues (Should Fix)

### 7. Duplicate Login Screens

There are **TWO** login screens:
- `src/screens/LoginScreen.tsx` (old, with logo image, hidden dev mode)
- `src/shared/screens/LoginScreen.tsx` (new, with gradient UI, visible dev buttons)

The `RootNavigator.tsx` imports from `../screens/LoginScreen` (the OLD one), but this file still references `../../assets/logo.jpg`. The new login screen at `src/shared/screens/LoginScreen.tsx` is **never used**.

**Fix:** Delete the old login screen or consolidate.

### 8. Hardcoded Coach Email-to-Color Mapping (Duplicated 4+ Times)

**Files:** `admin/screens/OverviewScreen.tsx`, `admin/screens/ScheduleScreen.tsx`, `admin/screens/EarningsScreen.tsx`, `coach/screens/OverviewScreen.tsx`

The same `COACH_COLORS` object is copy-pasted in at least 4 files:
```typescript
const COACH_COLORS: Record<string, string> = {
  'jeremy@jmt.com': '#00BFFF',
  'isaac@jmt.com': '#FFD700',
  // ...
};
```

**Problems:**
- Hardcoded to specific email addresses — won't work for new coaches
- Duplicated code — changes need to be made in 4+ places
- Breaks when coaches change email

**Fix:** Move to a shared utility. Better: store color preference in the database or generate deterministic colors from coach ID.

### 9. Hardcoded PT Commission Rates (Duplicated)

**Files:** `admin/screens/OverviewScreen.tsx`, `admin/screens/ScheduleScreen.tsx`

```typescript
const PT_RATES = {
  solo_package: { session_rate: 80, commission: 40 },
  solo_single: { session_rate: 80, commission: 40 },
  buddy: { session_rate: 120, commission: 60 },
  house_call: { session_rate: 140, commission: 70 },
};
```

But the database already has per-coach rates (`solo_rate`, `buddy_rate`, `house_call_rate`, `pt_commission_rate`). These hardcoded defaults can conflict with database values.

### 10. Singapore Timezone Handling is Fragile

Multiple files manually add `8 * 60 * 60 * 1000` for SGT conversion:
```typescript
const singaporeOffset = 8 * 60 * 60 * 1000;
const sessionInSG = new Date(sessionDate.getTime() + singaporeOffset);
```

**Problem:** This doesn't account for the device's timezone. If a user's phone is already in SGT, times will be double-shifted. The code adds SGT offset to UTC but then compares against `new Date()` which is in local time.

**Fix:** Use a proper timezone library (`date-fns-tz` or `luxon`) or store/compare everything in UTC.

### 11. Console.log Statements Left in Production Code

Extensive debug logging throughout:
```typescript
console.log('🔍 [OverviewScreen] Fetching PT sessions for admin');
console.log('[NOTIF DEBUG] PT session cancelled, preparing notification for coach');
console.log('=== NOTIFICATION DEBUG START ===');
```

These expose internal data structures, user IDs, and business logic to anyone with a debugger.

### 12. "Forgot Password" Button Does Nothing

**File:** `src/shared/screens/LoginScreen.tsx`, line ~134:
```typescript
<TouchableOpacity style={styles.forgotButton}>
  <Text style={styles.forgotText}>Forgot Password?</Text>
</TouchableOpacity>
```
No `onPress` handler — the button is decorative.

### 13. "Edit Profile" and "Change Password" Buttons Do Nothing

**File:** `src/shared/screens/ProfileScreen.tsx`, lines ~131-137:
```typescript
<TouchableOpacity style={styles.actionButton}>
  <Text style={styles.actionButtonText}>Edit Profile</Text>
</TouchableOpacity>
<TouchableOpacity style={styles.actionButton}>
  <Text style={styles.actionButtonText}>Change Password</Text>
</TouchableOpacity>
```
No `onPress` handlers.

### 14. Payslip Generation Logic Has Potential Bugs

**File:** `admin/screens/CoachesScreen.tsx`, `generateCoachPayslip` function:

- Queries `classes` table filtering by `scheduled_at` but the `classes` table uses `day_of_week` and `start_time` (recurring schedule), not `scheduled_at`. This query will likely return 0 results.
- Uses `session_price` field but the `PTSession` type uses `session_rate`. Field name mismatch.
- Hardcoded 0.17 CPF rate — should be configurable.
- The weekly breakdown logic uses naive date math that may miss sessions at month boundaries.

### 15. Missing Error Handling on Many Supabase Queries

Multiple places ignore the `error` return from Supabase:
```typescript
// admin/screens/OverviewScreen.tsx
const { data: classes } = await supabase.from('classes').select(...)
// error is destructured away — silent failure
```

If these queries fail, the UI silently shows empty data with no user feedback.

---

## 🟢 Minor Issues (Nice to Have)

### 16. `app.json` Splash Screen Has White Background

```json
"splash": {
  "backgroundColor": "#ffffff"
}
```

The app has a dark theme (`#0A0A0F`). A white splash will cause a jarring flash.

### 17. No Loading States on Some Screens

`AdminMembersScreen`, `AdminBroadcastScreen` don't show loading indicators on initial data fetch.

### 18. No Pull-to-Refresh on Member Portal

The member portal is unimplemented, but when built, should include refresh controls.

### 19. Unused Imports

`MaterialCommunityIcons` imported in `Icons.tsx` and `AdminNavigator.tsx` but some icons may not be used.

### 20. Default Password "JMT1234" is Weak

**File:** `CoachesScreen.tsx` line ~310:
```typescript
password: 'JMT1234',
```
Short, predictable, and displayed in an alert. Should be a random temporary password or use email invite flow.

### 21. No Input Sanitization

User inputs (names, messages, notes) are not sanitized before being stored in the database. While Supabase parameterizes queries (preventing SQL injection), XSS could be an issue if data is ever rendered in a web context.

### 22. `FuturisticUI.tsx` GradientText Doesn't Actually Render Gradient

```typescript
export const GradientText = ({ children, style, colors }) => (
  <Text style={[styles.gradientTextFallback, style]}>{children}</Text>
);
```
The `colors` prop is accepted but never used. The text is just solid blue.

---

## 🔒 Security Review

### Supabase Configuration
- **Anon key exposed:** Yes, in source code. Safe if RLS is solid, but should use env vars.
- **Service role key:** NOT in client code (good). But `supabaseAdmin.ts` **pretends** to be admin while using anon key.
- **RLS enabled:** Yes, SQL files show RLS is enabled on key tables.

### RLS Policy Assessment
Based on `fix_admin_rls_policies.sql`:
- ✅ `pt_sessions`: Proper role-based policies for SELECT/INSERT/UPDATE/DELETE
- ✅ `classes`: Admins can manage, coaches can view
- ✅ `users`: Users see own data, admins see all
- ✅ `notifications`: Users see own, admins see all
- ✅ `leave_requests`: Coaches can create/update own, admins can update all
- ⚠️ **No RLS mentioned for:** `broadcasts`, `payslips`, `class_coaches`, `bookings`, `memberships`, `coach_profiles`
- ⚠️ PT session SELECT policies overlap (policy 2 includes admin check already covered by policy 1)

### Authentication Flow
- ✅ Session persistence via AsyncStorage
- ✅ Auto token refresh
- ✅ First-login password change flow
- ⚠️ Password minimum length is only 6 characters
- ❌ No rate limiting on login attempts (client-side)
- ❌ No session timeout / auto-logout

### Data Exposure Risks
- Coach salary, hourly rates, and commission rates are fetched and displayed — ensure only master_admin can see these via RLS
- PT session prices and commission amounts visible to coaches — verify this is intended
- Member emergency contact info accessible — ensure only admin roles can query this

---

## 📋 Missing Features / Incomplete Areas

| Feature | Status | Priority |
|---------|--------|----------|
| **Member Portal** | 100% placeholder | Critical |
| Class booking (members) | Not started | Critical |
| PT booking (members) | Not started | Critical |
| Membership management | Not started | Critical |
| Member payment/billing | Not started | High |
| Push notifications | expo-notifications in deps but not wired | High |
| Forgot password flow | Button exists, no handler | Medium |
| Edit profile | Button exists, no handler | Medium |
| Change password (non-first-login) | Button exists, no handler | Medium |
| Image/avatar upload | Avatar placeholder only | Low |
| Admin PT Payments screen | Has TS errors, may not work | Medium |
| Biometric auth | `expo-local-authentication` in deps, not used | Low |
| Offline support | None | Low |
| Error boundaries | None — any uncaught error crashes entire app | Medium |

---

## 📊 Overall Assessment

**Rating: 5/10 — Functional prototype, not production-ready**

### Strengths
- Clean, consistent dark UI theme with good component abstractions (`FuturisticUI.tsx`)
- Solid admin portal with comprehensive coach management, scheduling, earnings tracking
- Real-time notification subscriptions via Supabase channels
- Good payslip system with weekly PT breakdowns
- Leave request workflow (request → approve/reject → notify)
- PT session verification flow (coach verify → member verify → admin approve)

### Weaknesses
- **Member portal is 0% complete** — the largest user segment has no functionality
- **37+ TypeScript errors** including several that will crash at runtime
- **Security concerns** with hardcoded credentials, fake admin client, dev login in production
- **Excessive code duplication** (coach colors, PT rates, timezone helpers duplicated 4+ times)
- **No error boundaries** — one unhandled error crashes the entire app
- **No automated tests** — zero test files found
- **Fragile timezone handling** that will break for non-SGT users

### Recommended Priority Order
1. Fix runtime-crashing TypeScript errors (immediate)
2. Remove/guard dev login for production builds
3. Move Supabase keys to environment variables
4. Replace `supabaseAdmin` with Edge Function for user creation
5. Build member portal (at minimum: view classes, view PT sessions)
6. Add error boundaries
7. Consolidate duplicated code (coach colors, PT rates, timezone utils)
8. Add proper timezone handling
9. Remove console.log statements
10. Implement missing button handlers (forgot password, edit profile)
