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

## How to use this skill
- Editing leave or PT code → re-read sections 1, 2, 5, 7
- Editing classes / class assignments → re-read section 3
- Adding any new notification type → re-read section 4
- Adding any new Telegram alert with dynamic user content → re-read section 6
- Adding any status-mutation server action → re-read section 7
- When you fix a new class-of-bug worth remembering, append it as section 8, 9, etc. Keep each section to: Symptom → Root cause → Fix pattern → When it applies.
