# JMT Web Admin Portal - Build Log

## Status: COMPLETE ✅
**Location:** `JMT_SuperApp/web-admin`
**Stack:** React + Vite + Tailwind + Supabase

## Completed Features

### 1. Authentication
- **Role-based Logic:** Checks `users` table for `role`.
- **Redirects:** `master_admin` -> Dashboard, `admin` -> Schedule.
- **Login Screen:** Branded with "Jai Muay Thai" and slogan.

### 2. Dashboard (Overview)
- **Stats Cards:** Total Members, Active Coaches, Monthly Revenue.
- **Recent Activity:** Placeholder for recent bookings.

### 3. Schedule Page
- **View:** Weekly day picker (Sun-Sat).
- **Cards:** "Time-Left" layout (Time | Class Info | Capacity).
- **Real Data:** Fetches from `classes` and counts `class_enrollments`.
- **Actions:** "+ Add Class" button, "Edit Class" modal.

### 4. Members Page
- **List:** Full member directory from `users` table.
- **Add Member:** Modal to create new member accounts.

### 5. Coaches Page
- **List:** Directory of coaches.
- **Add Coach:** Uses `create-user` Edge Function to create authenticated users.
- **Edit:** Update rates, specialty, etc.

### 6. Earnings Page
- **PT Payments:** List of verified sessions pending payment.
- **Approval:** "Approve Payment" button updates `pt_sessions` and `pt_packages`.

### 7. HR Page
- **Payslips:** List of generated payslips.
- **Status:** Mark as Paid.

## Recent Fixes (Feb 10)
- **Bug:** Changed table `bookings` -> `class_enrollments` in Schedule page.
- **UI:** Redesigned Schedule cards for better readability.
- **Branding:** Applied Jai Blue (`#0096FF`) consistently.

## How to Run
```bash
cd web-admin
npm install
npm run dev
```
