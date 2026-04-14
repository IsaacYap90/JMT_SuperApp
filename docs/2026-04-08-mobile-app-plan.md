# JMT Dashboard → Mobile App: Build Plan

**Author:** Isaac (drafted with Claude while Isaac sleeps)
**Date:** 2026-04-08
**Source project:** `~/projects/jmt/dashboard/` (Next.js 14 + Supabase, deployed at `dashboard-dun-eta-82.vercel.app`)
**Goal:** Ship JMT to the App Store and Play Store as a real mobile app — same Supabase backend, same auth, same data, no second codebase.

---

## TL;DR — the recommended path

**Wrap the existing Next.js dashboard in Capacitor and ship it as a hybrid native app.**

- One codebase. The Vercel deployment stays as-is.
- Capacitor adds: native push, splash screen, status bar styling, biometric unlock, camera, secure storage, app store presence.
- The native shell loads our Vercel URL via Capacitor's `server.url` setting (with offline fallback page).
- Apple/Google reviews accept this pattern when paired with native plugins (push, biometric, etc.) — Capacitor apps pass review consistently.
- Coaches install from the store, log in once with Face ID / fingerprint, get push for new bookings/leave approvals, and the rest of the UX is the dashboard they already know.

**Not recommended:** A full React Native rewrite. It would double the codebase, freeze dashboard development, and Jeremy + the coaches don't need pixel-perfect native widgets — they need fast access, push, and biometric login. Capacitor delivers all of that in days, not months.

---

## 1. Why Capacitor over the alternatives

| Approach | Codebase | App Store | Push | Biometric | Time to ship | Risk |
|---|---|---|---|---|---|---|
| **PWA only** (current state, partial) | 1 | ❌ | iOS limited | ❌ | already partly done | low feature ceiling |
| **Capacitor wrap** ✅ | 1 | ✅ | ✅ native | ✅ | low | App Store review needs native value-add |
| **React Native rewrite** | 2 | ✅ | ✅ | ✅ | high | doubles maintenance, freezes dashboard work |
| **Expo Web + RN** | 2 (shared logic only) | ✅ | ✅ | ✅ | high | same issue, plus learning curve |

The dashboard is already mobile-first (we built every screen with iPhone in mind). The web version IS the mobile UI. Rebuilding it natively is wasted effort.

---

## 2. Architecture

```
┌─────────────────────────────────────────────┐
│  iOS / Android native shell (Capacitor)     │
│  • Splash, app icon, status bar             │
│  • Native push (FCM + APNs)                 │
│  • Biometric unlock                         │
│  • Camera (receipts, profile photos)        │
│  • Secure storage (auth token cache)        │
│  • Offline fallback HTML                    │
└─────────────────────────────────────────────┘
                  │
                  │  loads (Capacitor server.url)
                  ▼
┌─────────────────────────────────────────────┐
│  Existing Next.js dashboard on Vercel       │
│  dashboard-dun-eta-82.vercel.app            │
│  • All current routes                       │
│  • Server actions, RSC, middleware auth     │
│  • Supabase queries unchanged               │
└─────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│  Supabase (xioimcyqglfxqumvbqsg)            │
│  • users, classes, pt_*, leaves, trials...  │
└─────────────────────────────────────────────┘
```

The native shell is **thin**. It does not duplicate any business logic. Server actions still run on Vercel.

### Two-way bridge

The web dashboard needs to call into the native layer for:
- Requesting push permission
- Reading the FCM/APNs token to register the device for notifications
- Triggering biometric unlock on app open
- Opening the camera

This is done with Capacitor JS plugins. The dashboard imports them with a runtime check (`if (Capacitor.isNativePlatform())`) so the same code still runs on web without breaking.

---

## 3. Repository layout

We keep the dashboard as the single source of truth, and add a `mobile/` sibling folder:

```
~/projects/jmt/
├── dashboard/              ← unchanged Next.js project
│   └── src/lib/native.ts   ← NEW: Capacitor bridge helpers (runtime-guarded)
└── jmt-mobile/             ← NEW: Capacitor wrapper
    ├── ios/                ← Xcode project
    ├── android/            ← Android Studio project
    ├── capacitor.config.ts ← server.url + plugin config
    ├── resources/          ← icon + splash assets
    └── package.json
```

The `mobile/` folder owns the native projects only — no UI code. When we run `npx cap sync`, Capacitor copies the dashboard URL into the native projects.

---

## 4. Phased delivery

These phases are ordered by **dependency**, not calendar dates. Each phase ends with a TestFlight build Isaac can install and tap.

### Phase 0 — Decisions to lock in BEFORE coding (1 short call with Jeremy)

1. **App name** in the stores: "JMT Coach" / "Jai Muay Thai" / "JMT Dashboard"?
2. **Bundle IDs**: e.g. `com.jaimuaythai.coach` (iOS) and `com.jaimuaythai.coach` (Android). Once chosen, **never** change them — it forces a fresh app listing.
3. **Apple Developer account**: $99/yr. Personal or company entity? (Company = needs DUNS number.)
4. **Google Play Console**: $25 one-time.
5. **Push provider**: Firebase Cloud Messaging is free for both platforms — recommended.
6. **Who's the listed developer / contact email** in the stores?

These are paperwork blockers, not coding blockers. If we don't have them ready, the build can finish but the submission can't.

### Phase 1 — Capacitor scaffold + remote URL load

Goal: native shell that opens the live Vercel dashboard.

- Create `~/projects/jmt/jmt-mobile/`
- `npm init`, `npm i @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android`
- `npx cap init "JMT" "com.jaimuaythai.coach"`
- `capacitor.config.ts`:
  ```ts
  server: {
    url: "https://dashboard-dun-eta-82.vercel.app",
    cleartext: false,
  }
  ```
- `npx cap add ios` + `npx cap add android`
- App icon set + splash from a single 1024×1024 source via `@capacitor/assets`
- `npx cap open ios` → run on simulator → confirm dashboard loads + login works.

**Exit criterion:** Isaac can log in on iOS simulator and use the dashboard exactly as on Safari.

### Phase 2 — Splash, status bar, hide URL chrome

Goal: hide every visual cue that this is a webview.

- `@capacitor/splash-screen` — show splash until first paint, then auto-hide
- `@capacitor/status-bar` — set to dark, match the dashboard's `bg-jai-bg`
- Keyboard plugin so the input field doesn't shove the layout when typing
- `next.config.mjs` viewport headers to disable pinch-zoom inside the shell
- A `.is-native` class added to `<html>` when Capacitor detects native — used to hide things like "Open in Vercel" debug links if any leak through

**Exit criterion:** Looks indistinguishable from a native app at first glance.

### Phase 3 — Auth: biometric unlock + token persistence

Goal: log in once, then Face ID / fingerprint forever.

- After successful Supabase login, save the refresh token in `@capacitor/preferences` (which uses iOS Keychain / Android Keystore under the hood)
- On app open, if a saved token exists, prompt biometric (`@aparajita/capacitor-biometric-auth`)
- On success, restore the Supabase session via `supabase.auth.setSession()` before the dashboard mounts
- If biometric is denied or unavailable, fall back to normal email/password login

This needs a small new endpoint on the dashboard side: `/api/native/session-bootstrap` — POSTs the saved token, returns a fresh session. The dashboard middleware needs to allow this route through.

**Exit criterion:** Isaac and Jeremy never type a password again after the first login.

### Phase 4 — Push notifications (the big win for Jeremy)

This replaces the Telegram alert system for users who install the app. Telegram stays as the fallback / admin-side ops channel.

Backend additions:
- New table `device_tokens (user_id, token, platform, last_seen_at)`
- New server action `registerDeviceToken(token, platform)` called from the native shell after permission grant
- New helper `sendPush(userIds, title, body, data)` that uses the Firebase Admin SDK on Vercel
- Wire into existing `createNotification()` so every in-app notification *also* fires a push if the recipient has a token registered

Native side:
- `@capacitor/push-notifications`
- Request permission on first launch (with a dashboard-side intro screen explaining why)
- On token receipt, post it to the dashboard
- Handle tap-to-open: route the user into the dashboard at the relevant screen (e.g. tap a "leave approved" push → open `/leave`)

**Exit criterion:** Jeremy creates a PT booking → coach's phone buzzes within 5 seconds, no Telegram needed.

### Phase 5 — Camera + receipts (nice-to-have, not blocking launch)

Goal: take photos of receipts directly in the app and have the OpenAI extraction route process them.

- `@capacitor/camera` to capture / pick from gallery
- On the dashboard side, `/api/extract-receipt` already exists (we use it elsewhere) — just wire the native camera to feed it
- Same flow: shutter → preview → submit → expense row created

This is purely additive. Skip for v1 if Jeremy doesn't need it on day one.

### Phase 6 — Offline fallback page

Goal: a graceful "you're offline" screen instead of a broken webview.

- Bundle a static `offline.html` (we already have one in `public/`)
- Configure Capacitor to load it when network is unreachable
- Add a "retry" button that re-pings the dashboard

**Exit criterion:** Coach loses signal in the gym → sees a clean offline message → connection comes back → tap retry → continues where they left off.

### Phase 7 — Beta distribution

- **iOS**: Upload to TestFlight via Xcode Organizer. Add Isaac, Jeremy, Shafiq, Larvin, Heng, Fairuz as internal testers (no Apple review needed for internal testers).
- **Android**: Upload AAB to Play Console internal track. Same testers.
- Both stores require: app description, screenshots, privacy policy URL, support email, age rating questionnaire.

### Phase 8 — App Store + Play Store submission

- iOS review: ~24-48h typical. Capacitor apps with native push + biometric pass review reliably; the trick is to ensure enough native value so it doesn't trigger the "this is just a webview wrapper" rejection (Apple guideline 4.2).
- Android review: faster, usually within hours.
- Both: prepare 2-3 screenshots per device size, a 30-second preview video (optional but helps), and a 4-line description.

---

## 5. Native plugins shopping list

| Plugin | Purpose | Critical? |
|---|---|---|
| `@capacitor/splash-screen` | Splash on launch | yes |
| `@capacitor/status-bar` | Match dashboard dark theme | yes |
| `@capacitor/keyboard` | Avoid layout jump on input focus | yes |
| `@capacitor/preferences` | Token persistence (Keychain/Keystore) | yes |
| `@aparajita/capacitor-biometric-auth` | Face ID / fingerprint | yes (for retention) |
| `@capacitor/push-notifications` | FCM + APNs | yes |
| `@capacitor/app` | Handle deep links from push tap | yes |
| `@capacitor/network` | Detect offline → switch to fallback | yes |
| `@capacitor/camera` | Receipt scanning | optional |
| `@capacitor/share` | Share schedule, etc. | optional |
| `@capacitor/haptics` | Tap feedback on key actions | optional polish |

---

## 6. Backend changes needed in the dashboard

These are small additions to the dashboard repo, not the mobile repo:

1. **`device_tokens` table** — see Phase 4. Migration via `mcp__claude_ai_Supabase__apply_migration`.
2. **`/api/native/register-device`** — accepts `{token, platform}` for the logged-in user.
3. **`/api/native/session-bootstrap`** — accepts a stored refresh token, returns a fresh session.
4. **`sendPush()` helper** in `src/lib/push.ts` — uses Firebase Admin SDK with a service account JSON in env vars.
5. **Wire `createNotification()`** to fire a push alongside the existing Telegram alert. Both can coexist; Telegram becomes a backup channel for admins/devs.
6. **Middleware bypass** for `/api/native/*` (similar to how we bypassed `/api/cron/*` for the daily-schedule cron).
7. **`<html className={isNative ? 'is-native' : ''}>`** — small tweak in `layout.tsx` based on a request header set by Capacitor (`x-capacitor-platform`).

Each of these is incremental and doesn't require freezing dashboard work.

---

## 7. Risks & how to mitigate them

| Risk | Impact | Mitigation |
|---|---|---|
| **Apple rejects under guideline 4.2** ("not a wrapper") | Can't ship to iOS | Ensure push, biometric, splash, and at least one camera flow are wired before submission. Highlight native value in the review notes. |
| **Vercel URL changes** (e.g. domain rebrand) | App breaks for everyone | Use a stable custom domain (e.g. `app.jaimuaythai.com`) instead of `dashboard-dun-eta-82.vercel.app` *before* the first store submission. Cloudflare or Vercel domain config — small task, big payoff. |
| **iOS Safari quirks in webview** (different from Mobile Safari) | Layout bugs only on real devices | Test every screen on a real iPhone, not just simulator. Capacitor uses WKWebView which is close to Safari but not identical. |
| **Push permission denial** | Coach silently misses alerts | Detect denial state and surface a "fix in Settings" banner inside the dashboard. Telegram fallback stays active for that user. |
| **Forced logout on token expiry** | Coach has to re-auth in the middle of a class | Refresh tokens proactively on app foreground, not on first failed request. |
| **Biometric not enrolled on the device** | Phase 3 silently fails | Detect with `BiometricAuth.checkBiometry()` before prompting; fall back to password. |
| **Two stores, one developer** | Burnout on submission paperwork | Ship iOS first (smaller test pool), Android a week later. Don't try to launch simultaneously. |

---

## 8. Cost summary

**One-time:**
- Apple Developer Program: USD $99 (renews yearly, so really yearly)
- Google Play Console: USD $25 one-time
- Custom domain (if not already owned): ~RM 50/yr

**Recurring:**
- Apple Developer renewal: USD $99/yr
- Firebase Cloud Messaging: free at our scale
- Supabase / Vercel: unchanged (already paying)

**Total to ship v1:** under RM 700, mostly Apple's fee. Everything else is engineering time.

---

## 9. What ships in v1 vs v2

### v1 (must-have for first store submission)
- Capacitor wrapper loading the dashboard
- App icon, splash, dark status bar
- Biometric unlock with token persistence
- Push notifications wired through `createNotification()`
- Offline fallback page
- Custom domain (`app.jaimuaythai.com` or similar)
- Internal beta tested by all coaches for at least a week

### v2 (post-launch, in priority order)
- Camera + receipt scanning
- Tap-to-deep-link from push (e.g. push opens the specific PT session edit modal)
- Haptic feedback on key actions
- Share-sheet integration ("share my schedule")
- Apple Watch glance for tomorrow's first class (much later, not committed)

### Explicitly NOT in scope
- React Native rewrite of any screen
- A separate "member-facing" app (members still book via the public Calendly + WhatsApp flow Jeremy already runs)
- Offline-first sync of leave/PT data — too complex for v1, push + a clean reload covers 95% of needs

---

## 10. Open questions for Isaac (decide tomorrow)

1. **App name in the stores** — short and obvious wins. "JMT Coach"?
2. **Bundle ID** — locks forever once submitted. `com.jaimuaythai.coach` or something else?
3. **Apple Developer account** — under your personal name or under Lydia's IonicX AI entity (since she's the registered owner)? This affects who's listed as the publisher.
4. **Custom domain** — is `app.jaimuaythai.com` available, or do we need a different subdomain?
5. **Push opt-in copy** — what message do we show coaches when asking for notification permission? ("Get instant alerts when Jeremy schedules a PT or approves your leave")
6. **Privacy policy** — Apple requires a URL. We can host a simple one on the dashboard at `/privacy`. Want me to draft that as part of v1?
7. **Member side** — confirming we are NOT building anything for members in v1. Coaches and admins only.
8. **Should the daily 6am Telegram cron be replaced by push** for users who install the app? Or keep both running in parallel for the first month?

Each of these is a 30-second answer over coffee tomorrow. None of them block me from starting Phase 1 tonight if you want — but answers to #1, #2, #3 are needed before we can submit to the stores.

---

## 11. Recommended next action when Isaac wakes up

Pick **one** of these to give me a green light on:

- **A. "Start Phase 1 now"** — I scaffold `~/projects/jmt/jmt-mobile/`, get the iOS simulator loading the dashboard, and you wake up to a working hybrid app shell you can test on your iPhone (after we set up the dev cert).
- **B. "Wait, let me think about scope first"** — I park the plan and we revisit during the day after you've talked to Jeremy.
- **C. "Adjust the plan first"** — tell me which phases to drop, reorder, or expand.

Ping me on Telegram with A, B, or C and I'll act on it.
