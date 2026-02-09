# PT Terms & Conditions Implementation Plan

## Overview
Implement legal and operational safeguards for Personal Training sessions, ensuring compliance with JMT's terms (24h cancellation policy, non-refundable payments, liability waivers).

---

## 1. Database Changes
We need to track acceptance and signatures.

### New Fields/Tables
1.  **`pt_packages` table**:
    -   Add `terms_accepted_at` (timestamptz, nullable)
    -   Add `terms_accepted_ip` (text, nullable)
    -   *Why:* Legal proof that they agreed when buying.

2.  **`pt_sessions` table**:
    -   Add `attendance_verified_by_member_at` (timestamptz) — "Digital Signature"
    -   Add `cancellation_fee_waived` (boolean, default false) — For medical/admin overrides

### New Policies (RLS)
-   Ensure members can only update `attendance_verified_by_member_at` for their own sessions.

---

## 2. Feature Implementation

### A. PT Package Purchase (T&C Acceptance)
-   **Screen:** `PackageDetailsScreen` / `PurchaseScreen`
-   **UI:** Add a "Terms & Conditions" modal or scrollable text area.
-   **Logic:**
    -   "I agree" checkbox must be checked to enable the "Buy" button.
    -   On purchase, save `terms_accepted_at: new Date()` to `pt_packages`.

### B. 24-Hour Cancellation Enforcement
-   **Screen:** `PTSessionsScreen` (Member)
-   **Logic:**
    -   Calculate `hoursUntilSession = (sessionDate - now) / 3600000`.
    -   **If > 24 hours:** Allow cancel. Logic: `status = 'cancelled'`, refund credit.
    -   **If < 24 hours:** Show Alert: "Late Cancellation. You will forfeit this session per T&Cs."
    -   **If Confirmed:** Set `status = 'cancelled'`, `cancellation_reason = 'Late Cancel'`, do **NOT** refund credit.

### C. Digital Attendance Signing
-   **Trigger:** Coach marks session as `completed` or `attended`.
-   **Notification:** Member gets push notif: "Please confirm attendance."
-   **Screen:** `PTSessionsScreen` (Member) -> "Confirm Attendance" button appears on completed sessions.
-   **Action:** Tapping it updates `attendance_verified_by_member_at`.
-   **Admin View:** Shows "Signed" status in payroll.

### D. T&C Reference
-   **Screen:** `ProfileScreen`
-   **Action:** Add "Terms & Conditions" link in Settings.
-   **Content:** Static text of the warranties and rules provided.

---

## 3. Estimated Timeline
-   **Database Migration:** 30 mins
-   **T&C UI (Purchase & Profile):** 2 hours
-   **Cancellation Logic:** 2 hours (Need careful testing of timezones)
-   **Digital Signature Flow:** 3 hours (Notifications + UI state)
-   **Total:** ~1.5 Days

---

## 4. Potential Conflicts
-   **Timezones:** Critical. "24 hours" must be calculated against the **session's timezone** (SGT), not just the user's local device time (if they are traveling). We should use server-side time or robust SGT conversion.
