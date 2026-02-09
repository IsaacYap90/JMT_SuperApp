# AI Earnings Analysis - Feature Assessment

## 1. Feasibility Analysis
**Verdict: Highly Feasible** with existing data.

We have all the core data points required in the current Supabase schema:
- **PT Revenue:** `pt_sessions` table contains `session_price`, `coach_id`, and `scheduled_at`.
- **Membership Revenue:** `memberships` table contains `price_paid` and `start_date`.
- **Attendance Data:** `class_enrollments` and `pt_sessions` provide timestamped attendance.

No new tables are strictly necessary, but **Database Views** or **RPC Functions** are recommended to ensure performance. Calculating these aggregations on the mobile device (client-side) would be slow and data-heavy.

---

## 2. Technical Implementation & Complexity

### Estimated Time: 3-5 Days
- **Day 1: Backend Logic** — Writing SQL queries/RPC functions for aggregations (e.g., `get_monthly_revenue`, `get_coach_performance`).
- **Day 2: UI Components** — Integrating a charting library (e.g., `react-native-chart-kit` or `victory-native`) and building the "Insight Cards".
- **Day 3: Logic Integration** — Wiring up the API to the UI, handling timezones, and "Trend" logic (comparing current month vs last month).
- **Day 4: Forecasting & Alerts** — Implementing the simple predictive logic ("Projected Revenue") and anomaly detection ("No bookings alert").
- **Day 5: Testing & Polish** — Ensuring numbers match payslips exactly.

### Complexity: Medium
- **Challenge:** Timezone handling for "Daily" stats (UTC vs SG time) is critical.
- **Challenge:** accurately projecting recurring revenue if memberships vary in length.

---

## 3. Database Changes
**No structural changes (new tables) required.**

However, we **SHOULD** create:
1.  **PostgreSQL Views/RPCs:**
    - `get_monthly_gym_revenue(month, year)`
    - `get_coach_performance_stats(month, year)`
    - `get_attendance_heat_map()`
2.  **Why?** To keep the app fast. We don't want to download 5,000 past sessions just to count them.

---

## 4. SaaS Premium Potential
**Verdict: Perfect Upsell Feature**

This fits perfectly into the **Elite Tier ($299/mo)**.
- **Starter/Growth tiers:** See simple numbers (Current Month Earnings).
- **Elite tier:** Sees "AI Insights," Trends, Forecasts, and Comparison Benchmarks.

**Value Proposition:** "Don't just track your cash—optimize it. Our AI Insights tell you which classes make money and which coaches are top performers."

---

## 5. Recommendation
**Build it.** It adds high perceived value ("AI") with relatively low technical risk (standard data analytics). It creates a "sticky" feature that owners rely on to run their business.
