# Meta App Review — JMT Leads (Draft)

App: JMT Leads (Meta for Developers)
Purpose: Pipe Meta Lead Ads submissions from Jai Muay Thai's Facebook Page into an internal admin dashboard so the sales lead (Jeremy Jude) can follow up within minutes via WhatsApp instead of missing leads in email noise.

## App use case description (top-level)
Jai Muay Thai is a Singapore-registered martial arts gym (ACRA/UEN, est. 2018) running Lead Ads on Facebook and Instagram to acquire new students. Today those leads arrive as emails that go unread. This integration subscribes to the `leadgen` webhook, fetches the submitted form fields via the Leads API, stores them in our private Supabase database, and sends a Telegram DM to the sales lead with a click-to-chat WhatsApp link. No data leaves our infrastructure. No data is shared with third parties. No data is used for advertising.

---

## Permissions requested

### 1. `pages_show_list`
**Why:** Required at token-exchange time so the backend can identify which Pages the authorising admin owns. We only use it once during setup to fetch the Jai Muay Thai Page ID and its Page Access Token.
**Data usage:** Page ID and Page name cached server-side only. Never exposed to users, never logged, never shared.

### 2. `pages_read_engagement`
**Why:** Required by the `leadgen` webhook field on the Page subscription endpoint. Without it, Meta rejects the webhook subscription.
**Data usage:** We do not actually read post engagement. The permission is held only to satisfy the webhook subscription requirement.

### 3. `leads_retrieval`
**Why:** Core of the integration. When Meta fires the `leadgen` webhook with a `leadgen_id`, the backend calls `GET /{leadgen_id}?fields=field_data,created_time,platform` to retrieve the submitted form fields (full name, contact number, email, interest selector).
**Data usage:** Data is written to a single Supabase row in `public.leads`, visible only to authenticated gym admins (coaches cannot see leads). Used to contact the prospect via WhatsApp. Never shared, never used for ads, never exported.

### 4. `pages_manage_ads`
**Why:** Required to call `GET /{page-id}/leadgen_forms` so we can list and select which active Lead Ad forms to pipe into the dashboard during setup.
**Data usage:** Form ID + form name are read once at setup time. No ad creatives, targeting, or spend data is accessed.

### 5. `business_management` (only if Business Portfolio is needed)
**Why:** Jai Muay Thai's Page sits inside a Meta Business Portfolio. Token exchange fails without this scope when the admin's access to the Page is inherited from the Business Portfolio rather than direct.
**Data usage:** Read-only confirmation of Business → Page membership at setup. No business assets are modified.

---

## Screencast requirements
Each permission needs a ~1-min screen recording showing:
1. Admin logging into the dashboard at `https://dashboard-dun-eta-82.vercel.app` (until `app.jaimuaythai.com` DNS is fixed).
2. The Leads tab populated with leads that came through the webhook.
3. Clicking the WhatsApp button → WA Web opens with the pre-filled Jeremy intro message.
4. The backend log showing the `leadgen` webhook hit and the Leads API fetch.

Record via QuickTime (Mac) at 1280×800, trim to 60s, upload as MP4 on the App Review form.

---

## Data Use Checklist (for the Review form)
- [x] Data stays on Vercel + Supabase (both SG/US region, SOC2 Type II).
- [x] No data sold, no data shared with advertisers, no analytics vendors.
- [x] Retention: indefinite while the lead is active; deletion on request via dashboard admin.
- [x] Access controls: Supabase RLS + Next.js middleware gate.
- [x] Data Deletion URL: (TODO — add a `/data-deletion` page before submitting)
- [x] Privacy Policy URL: https://jaimuaythai.com/privacy (TODO — confirm exists, else publish)

---

## Blockers before submission
1. `META_PAGE_ACCESS_TOKEN` (long-lived) not yet set on Vercel production.
2. `app.jaimuaythai.com` DNS not resolving — App Review reviewers will test the callback URL.
3. Privacy Policy + Data Deletion pages must be live on `jaimuaythai.com`.
4. Screencasts need to be recorded after a real lead flows end-to-end.

---

_Draft prepared 2026-04-14 night. Review with Isaac before submitting._
