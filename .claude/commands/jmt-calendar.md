# JMT Calendar (ICS) — Route Anatomy + Deep Links

The `/api/calendar?id={userId}` endpoint builds an ICS feed that iPhone / Google / Outlook subscribe to. Serves two event types: recurring classes and one-off PT sessions.

## Subscription model

- Feed URL: `https://{prod-domain}/api/calendar?id={coach_user_id}` (coach view) or `?id={user_id}&admin=1` (all-classes view)
- Public path (no auth) — already in `middleware.ts` allowlist under `/api/calendar`.
- iOS subscribed calendars **do not have a user-configurable refresh dropdown** (that's CalDAV accounts only). Refresh cadence is taken from the ICS headers:
  - `X-PUBLISHED-TTL:PT30M`
  - `REFRESH-INTERVAL;VALUE=DURATION:PT30M`
- iOS caps minimum refresh at ~15min regardless of header. 30min is our default — good balance between freshness and Vercel function invocations.

## Event types

### Classes (weekly recurring)

One `VEVENT` per class with:
- `RRULE:FREQ=WEEKLY;BYDAY={SU|MO|TU|WE|TH|FR|SA}` — infinite recurrence
- `DTSTART;TZID=Asia/Singapore` — first occurrence on/after the class's `created_at` that matches `day_of_week`, skipping any SG public holiday landing on that anchor date
- `EXDATE` for:
  1. All SG public holidays (past + future) that fall on this class's day-of-week
  2. Future approved coach leaves affecting any assigned coach on this class — past is past (phantom past classes are acceptable per Isaac)
  3. Half-day leaves: only skip if `classStartHHMM < "18:30"` — evening classes still run during half-day leave (JMT half-day rule)

### PT sessions (one-off)

One `VEVENT` per PT session, all history + all future, with:
- `DTSTART;TZID=Asia/Singapore:{local}` converted from UTC `scheduled_at` via `sgtParts()`
- `URL:{baseUrl}/pt/log/{pt.id}` — iPhone Calendar renders this as a tappable link → PT log form ("what we did today", "focus next session")
- `SUMMARY:PT — {client name}`
- `CATEGORIES:PT` (Class events use `CATEGORIES:Class`)

Status filter: only `scheduled | confirmed | completed` — cancelled/no-show are excluded.

## Timezone handling

- All `DTSTART` / `DTEND` / `EXDATE` use `TZID=Asia/Singapore`.
- The VCALENDAR declares the SGT timezone block inline (no DST, constant +08:00) so clients don't need Olson DB lookups.
- `sgtParts(utcDate)` converts a UTC JS Date to SGT wall-clock components using `Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" })` — handles the `24:00` quirk that some locales emit at midnight.

## Holiday source

`src/lib/sg-holidays.ts` — hardcoded list of SG public holidays with `{date, name}`. Update annually.

## Admin vs coach mode

- Default: filters classes to ones where the user is lead, assistant, or in `class_coaches`; filters PT sessions by `coach_id`.
- `?admin=1`: returns every active class and every PT session. Intended for master_admin only — route currently doesn't enforce this, protect via shareable link discipline.

## Deep-link base URL

```ts
const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`)
  .replace(/\/$/, "");
```

- `NEXT_PUBLIC_APP_URL` should be set on Vercel to the prod domain so tunnel-preview ICS feeds still deep-link to production PT log forms.
- If unset, falls back to the request host — fine locally, misleading for subscribed production calendars served via preview deploy.

## Testing changes

- Build the ICS locally: `curl 'http://localhost:3000/api/calendar?id=$USER_ID' > /tmp/jmt.ics`
- Sanity-check with an ICS validator (e.g. icalendar.org/validator) before pushing.
- For iOS: production subscriptions refresh every 30min — force by unsubscribe+resubscribe to the feed URL.

## Where it lives

- Route: `src/app/api/calendar/route.ts`
- PT log form (deep-link target): `src/app/pt/log/[id]/page.tsx`
- SG holidays: `src/lib/sg-holidays.ts`
- Middleware allowlist: `src/lib/supabase/middleware.ts`

## Related

- `jmt-pt` — PT session lifecycle and status transitions
- `jmt-classes` — class schedule source of truth
- `jmt-leave` — approved leaves → EXDATE source, half-day rule
