# JMT Dashboard Gotchas (Bugs / Quirks We've Hit Before)

Class-of-knowledge notes. Read before touching the related areas.

## 1. HH:MM:SS string comparison works directly

**The trick:** `c.start_time >= "18:30"` correctly compares times because Postgres `time` columns are returned as `HH:MM:SS` strings, and lexical string comparison on a fixed-width zero-padded format produces the same ordering as numeric comparison.

**Don't reach for:** `parseInt(time.split(":")[0])`, `dayjs(...)`, `new Date("1970-01-01T" + time)`, or any other date library. They all work but they're noise.

**Where it's used today:** `findAffectedClasses()` in `src/app/actions/leave.ts` filtering classes by start time for the half-day rule.

**When this applies:** any time you're filtering or sorting by a `time` column from Supabase. Use string comparison with a zero-padded literal like `"18:30"` or `"06:00"`.

**Caveat:** only safe if both sides are zero-padded `HH:MM` or `HH:MM:SS`. `"6:30"` (no leading zero) breaks the ordering. The Postgres `time` type always returns zero-padded so the database side is fine — only watch the literal you compare against.

---

## 2. SGT timezone construction for datetime-local inputs

**The pattern:**
```ts
const iso = new Date(`${newDate}T${newTime}:00+08:00`).toISOString();
```

`newDate` and `newTime` come from the HTML `<input type="date">` and `<input type="time">` (or two separate inputs). Concatenating with the `+08:00` offset and then `.toISOString()` produces a correct UTC string for Supabase.

**Don't reach for:** `new Date(date + " " + time)` — that parses as the user's *browser* local timezone, which silently breaks for any coach not on a SG laptop. Same problem with `new Date(`${date}T${time}`)` (no offset = local).

**Where it's used today:** `handleReschedule()` in `pt-card.tsx` for the PT coach reschedule flow.

**Pre-fill the inverse:** to populate a `<input type="datetime-local">` with an existing UTC timestamp in SGT, use:
```ts
const sgt = new Date(timestamp).toLocaleString("sv-SE", { timeZone: "Asia/Singapore" }).replace(" ", "T").slice(0, 16);
```
The `sv-SE` locale conveniently produces `YYYY-MM-DD HH:MM:SS` format which is closest to what `datetime-local` wants.

**When this applies:** any new feature with date/time pickers writing to a Supabase `timestamp with time zone` column. JMT is SG-only so the offset is hard-coded to `+08:00` — do not generalise without good reason.

---

## 3. Supabase join cardinality quirk: array vs object

**Symptom:** A Supabase query with a foreign-key join returns the joined relation as `class[]` in some cases and `class` (single object) in others. TypeScript types disagree with runtime shape.

**Root cause:** The Supabase JS client decides cardinality based on whether the join is one-to-one or one-to-many *by key direction*. If the FK is on the queried table → joined table is single object. If the FK points the other way → array.

**Workaround:** in code that consumes the join, normalise with `Array.isArray(row.class) ? row.class[0] : row.class` before access. Or use the `!inner` join hint to force the single-object form when you know the cardinality is 1.

**Where it bit us:** `class_coaches` bridge table joining `classes` — see `/jmt-classes` for the full breakdown of the lead coach + assistant coach resolution that has to handle both shapes.

**When this applies:** any new Supabase query with a `*, related_table(*)` join. Test the runtime shape, don't trust the generated types blindly.

---

## 4. Notifications type constraint is enforced at the DB

**Current allowed types** on `public.notifications.type`:
```
pt_created | pt_updated | pt_cancelled | pt_deleted
```

(Per the 2026-04-06 PT reschedule work — `pt_updated` covers reschedules without needing a new type.)

**When you need a new type:** the constraint is a Postgres `CHECK` (not just an enum). Adding a new type requires a Supabase migration to drop and recreate the check constraint with the new value included. **Code-only changes will silently fail** with a constraint violation when the insert hits the DB.

**Where it lives:** check via `select pg_get_constraintdef(c.oid) from pg_constraint c join pg_class t on c.conrelid = t.oid where t.relname = 'notifications';` in the Supabase SQL editor before adding a new type.

**When this applies:** any new feature that calls `createNotification()` with a type string not in the list above.

---

## 5. JMT half-day leave is NOT generic AM/PM

**Rule:** Half-day leave at JMT means the coach is **off before 6:30 PM** but **still teaches the evening classes**. This is the reverse of what most leave systems assume (AM-half / PM-half).

**Implementation:** any code path that filters classes affected by a half-day leave must skip classes whose `start_time >= "18:30"` (using the trick from §1). See `findAffectedClasses()` in `src/app/actions/leave.ts`.

**UI/notification copy:** always say "half day — off before 6:30pm" so coaches and admins don't get confused. Don't use "morning" / "AM" / "first half" labels.

**When this applies:** any new code touching leave logic, leave conflict checks, leave display badges, or leave notifications.

---

## 6. Telegram MarkdownV2 silently swallows messages with reserved chars

**Symptom:** A `createNotification()` / `sendTelegramAlertToUser()` call appears to succeed (no thrown error, calling code's counter increments) but the Telegram DM never lands. Only happens for messages whose body contains user-supplied dynamic content — class names, member names, parens, dashes, dots.

**Root cause:** `sendTelegramAlertToUser` uses `parse_mode: "MarkdownV2"`. The escape regex covers the standard reserved set, but Telegram is strict — any unescaped reserved char returns HTTP 400 `can't parse entities`. The helper logs the error to console but returns `void` and silently no-ops, so the upstream `Promise.allSettled` looks green.

**Fix pattern:** for any message with dynamic user content (class names, member names, free-form text), use `sendTelegramPlainToUser` instead. It skips `parse_mode` entirely and returns `boolean` so callers can distinguish actual delivery from no-op. Reserve `sendTelegramAlertToUser` for fixed-format alerts (PT scheduled, leave decisions) where the template is hand-escaped.

**Where it bit us:** the 6am daily schedule cron route (`src/app/api/cron/daily-schedule/route.ts`). Class lines like `• 7:00pm–8:30pm Adult Muay Thai (lead)` failed on the unescaped `(` even though the regex *should* have caught it — turned out the helper-level escape was running but the bot was rejecting some other quirk in the multi-line body.

**When this applies:** any new server action / API route that fires Telegram alerts containing data the user typed. If you can't guarantee the message body is fully under your control, use the plain-text helper.

---

## 7. Status-mutation server actions must be idempotent

**Symptom:** A user reports receiving the same notification twice after an admin tapped Approve / Reject / Cancel once. Often surfaces as "the alert bot fired the same message twice" with identical timestamps within ~1 second.

**Root cause:** Server actions like `reviewLeave` were re-runnable — there was no guard against being called when the row was already in the target state. Any client-side re-trigger (router refresh race, optimistic UI snapshot drift, accidental re-tap before the disable kicks in, Vercel function retry) would re-execute the update + notification pipeline.

**Fix pattern:** two layers of idempotency, both required.

1. **Code guard** — early return at the top of the action:
   ```ts
   if (row.status === action) {
     revalidatePath("/leave");
     return;
   }
   ```
2. **DB guard** — narrow the `update` query so the transition only fires from the expected source state:
   ```ts
   .from("leaves")
   .update({ status: action, ... })
   .eq("id", leaveId)
   .eq("status", "pending");
   ```

The DB guard covers the race that the code guard can't (two parallel calls reading status before either writes). Both together = no duplicate notifications, ever.

**Where it bit us:** `reviewLeave` in `src/app/actions/leave.ts` — Isaac saw the "Leave Approved ✅" alert twice on 2026-04-07. Fixed by adding both guards.

**When this applies:** any server action that mutates a status column AND fires a notification on transition. PT status updates, leave reviews, trial booking status, etc. If the action is "set X to Y and notify someone", it needs both guards.

---

## 8. Meta Lead Ads — field names are form-specific, not a fixed schema

**Symptom:** The webhook inserts a lead with empty `phone` even though the user clearly typed their phone number in the form. `name`, `email`, `interest` all populate correctly.

**Root cause:** Meta Lead Ads form fields are named by whoever built the form, not by a fixed schema. The Graph API returns `field_data` as an array of `{name, values}` pairs where `name` is whatever the form creator typed. JMT's 2026 form uses `contact_no:` instead of `phone` or `phone_number`, so a hardcoded `get("phone") || get("phone_number")` lookup silently returns empty.

**Fix pattern:** in `fetchLeadData`, use a broad list of candidates for each logical field. For phone:
```ts
phone: get("phone") || get("phone_number") || get("contact_no") || get("contact") || get("mobile") || ""
```
The `get` helper uses `.includes(key)` so any substring match wins. Add new aliases whenever Jeremy/marketing spin up a new form with a different field label — don't assume the previous form's field names carry over.

**Where it lives:** `fetchLeadData()` in `src/app/api/meta/lead-webhook/route.ts`.

**When this applies:** any time a new Meta Lead Ad form is created. Before trusting the webhook, fetch one lead manually via `GET /{leadgen_id}?fields=field_data` with a Page Access Token and eyeball the field names. Add any unfamiliar names to the candidate list.

---

## 9. Meta Graph API — User token vs Page token, `/me/accounts` vs `/{page-id}`

**Symptom A:** `(#100) Tried accessing nonexisting field (accounts)` when querying `/me/accounts` — happens when the token in hand is a Page Access Token, not a User Access Token. Pages don't have an `accounts` edge.

**Symptom B:** `(#190) This method must be called with a Page Access Token` when querying `/{page-id}/leadgen_forms` — this edge requires a Page token, not the User token you got from `/me/accounts`.

**Root cause:** Graph API Explorer's "User or Page" dropdown silently swaps the token type when you change the selection. If you forget you switched it, you'll hit one of the above depending on which edge you're calling.

**Fix pattern:**
- To list the Pages an admin manages → User token → `/me/accounts?fields=id,name,access_token,tasks`
- To read Page insights, leadgen forms, or subscribe webhooks → Page token → `/{page-id}/...`
- Exchange Page token from the `access_token` field in the `/me/accounts` response — that's already a Page token, no extra exchange needed.

**For production env:** store the Page Access Token returned from `/me/accounts` (never-expiring once the user token is long-lived) as `META_PAGE_ACCESS_TOKEN` on Vercel. Do NOT store a User token and call `/me/accounts` at request time — that token expires.

**When this applies:** any new Meta integration or when Meta tokens expire. Always name env vars explicitly (`META_PAGE_ACCESS_TOKEN`, `META_USER_ACCESS_TOKEN`) so you know what you're holding.

---

## 10. Meta webhook UI "green success" doesn't mean delivery

**Symptom:** In App Dashboard → Webhooks → "Test this webhook" the UI shows a green checkmark but the callback URL receives nothing. Logs empty, Supabase row not created.

**Root cause:** The "Send to server" button in the Meta testing panel validates that *Meta accepted the payload for dispatch*, not that your endpoint received it. App is often Unpublished at this stage, which Meta uses as a pretext to silently no-op real delivery while showing success in the UI.

**Fix pattern:** always verify the endpoint independently with a real `curl` before assuming the wiring works:
```bash
curl -X POST https://{callback-url}/api/meta/lead-webhook \
  -H "Content-Type: application/json" \
  -d '{"object":"page","entry":[{"id":"...","time":123,"changes":[{"field":"leadgen","value":{"form_id":"...","leadgen_id":"...","created_time":123,"page_id":"..."}}]}]}'
```
Expect `200 {"ok":true,"processed":N}`. If that works, your endpoint is fine — any "test but no delivery" is on Meta's side (usually: submit for App Review to enable production delivery).

**When this applies:** any new Meta product integration. Don't declare the webhook wiring done until both (a) Meta's testing panel is green AND (b) a real curl payload reaches the endpoint AND (c) a real lead form submission results in a DB row.

---

## How to use this skill
- Editing leave or PT code → re-read sections 1, 2, 5, 7
- Editing classes / class assignments → re-read section 3
- Adding any new notification type → re-read section 4
- Adding any new Telegram alert with dynamic user content → re-read section 6
- Adding any status-mutation server action → re-read section 7
- Any Meta Lead Ads / webhook / Graph API work → re-read sections 8, 9, 10
- When you fix a new class-of-bug worth remembering, append it as section 11, 12, etc. Keep each section to: Symptom → Root cause → Fix pattern → When it applies.
