# JMT SuperApp - Pre-Launch Checklist

## 1. Web Admin Portal
- [ ] **Overview Page:** Update to "Action Center" design (Tasks: Leave Requests, PT Payments). *In Progress*
- [ ] **Deploy:** Deploy `web-admin` to Vercel so Jeremy can access it.
- [ ] **Test:** Verify login flow for `jeremy@jmt.com` (Master Admin) and `sky@jmt.com` (Admin).

## 2. Mobile App (Member/Coach/Admin)
- [ ] **Waitlist:** Either implement backend logic (queue) or hide the button. currently UI-only.
- [ ] **Enrollment Counts:** Verify client-side counting is accurate in production.
- [ ] **Push Notifications:** Configure Expo Push Tokens (need physical device testing).
- [ ] **Deploy:** Build APK/IPA via EAS Build (`eas build --profile preview`).

## 3. Data & Content
- [ ] **Class Schedule:** Ensure all recurring classes for the week are populated in DB.
- [ ] **Coach Profiles:** Ensure all 6 coaches have photos and bios set.
- [ ] **Members:** Add a few test member accounts for coaches to "practice" with.

## 4. Legal & Compliance
- [ ] **Terms & Conditions:** Add the "I agree" checkbox to PT Package purchase flow.
- [ ] **Privacy Policy:** Link to a hosted policy (can use a generic template for now).

## 5. Final Sanity Check
- [ ] **Role Switching:** Log out as Admin, log in as Coach. Ensure no Admin tabs visible.
- [ ] **Booking Flow:** Book a class -> Cancel it. Check if count updates.
- [ ] **PT Flow:** Coach marks attended -> Admin sees "Pending Payment" -> Admin Approves -> Coach sees "Paid".

## Ready for Internal Testing?
Once the **Web Admin Overview** is updated and the **App is Built (APK)**, you are ready to hand it to the coaches.
