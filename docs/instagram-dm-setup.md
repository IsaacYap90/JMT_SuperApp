# Instagram DM → JAI — the Meta-side setup

**Why this exists.** On 2026-09-02 a real prospect DMed Jai Muay Thai on Instagram —
*"Hi! I'm quite interested in trying out Muay Thai, is there any packages I can check out?
I'm a beginner"* — and got only Business Suite's generic auto-reply. JAI never saw it.

The Meta app **JMT AI Bot (`1666435701309531`)** has exactly ONE webhook subscription:
`whatsapp_business_account → messages`. There is no `instagram` subscription and no
`page`/`messenger` one. Instagram DMs have never reached JMT OS. It was never wired.

The code half is now built (`/api/meta/instagram-webhook`). **This file is the half a
human must do.** Nothing below can be done from code, and until it is done the route is
inert — it will simply never be called.

---

## 0. Before you start

| Thing | Value |
|---|---|
| Meta app | JMT AI Bot — `1666435701309531` |
| Callback URL | `https://jmtos.ionicx.ai/api/meta/instagram-webhook` |
| Webhook topic | `instagram` |
| Webhook field | `messages` |
| Signing secret | the SAME `META_APP_SECRET` as WhatsApp (same app) |

⚠️ **Do not reuse the WhatsApp callback URL or verify token.** Meta stores one callback URL
and one verify token per topic. On 2026-07-20 JAI went deaf for 18 minutes because two Meta
apps were pointed at one secret env. Instagram gets its own `IG_VERIFY_TOKEN`.

⚠️ The Instagram account must stay **linked to the Facebook Page**. That link is what makes
the send path work (see §5). If it is ever unlinked, sending breaks and the app has to move
to the Instagram-Login API instead.

---

## 1. Env vars to add (Vercel, production)

Add with `vercel env add` — **never edit `.env.local`** (project hard rule).

| Var | New? | What it is |
|---|---|---|
| `IG_VERIFY_TOKEN` | **NEW** | Any long random string you invent. You type the same value into Meta's "Verify token" box in §3. Not a Meta-issued value. |
| `JAI_IG_AUTOREPLY` | **NEW** | Kill switch. Set `1` to let JAI auto-reply on Instagram. **Leave it unset for the first run** — DMs are still logged and you still get the Telegram ping, JAI just stays quiet. Turn it on once you have watched a few real DMs land correctly. |
| `META_APP_SECRET` | exists | Signature verification. Same app as WhatsApp, so nothing to change. |
| `META_PAGE_TOKEN` | exists | Page access token used to send the reply. Must be regenerated after §2 so it carries the new permission. |
| `META_PAGE_ID` | exists | The Facebook Page id — the send endpoint. |
| `META_IG_ID` | exists | The Instagram professional account id — used to ignore our own messages. |
| `DEEPSEEK_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JMT_TELEGRAM_BOT_TOKEN` | exist | Reply generation, DB, Telegram alerts. |

Redeploy after adding — Vercel env changes do not apply to an existing deployment.

---

## 2. Permissions

App Dashboard → **App Review → Permissions and Features**.

For an Instagram professional account **linked to a Facebook Page** (our setup), the
Instagram Messaging API needs:

- **`instagram_manage_messages`** — the one that is missing today. Without it, the
  `messages` webhook delivers nothing and the Send API returns error code 10.
- `instagram_basic`
- `pages_manage_metadata` — required to subscribe the Page to webhook fields
- `pages_read_engagement` **or** `pages_show_list`
- `pages_messaging` — required by the Send API

(Verified against Meta's *Webhooks – Instagram Platform* permission table and the
*Send a Message* guide, 2026-09-02.)

**`instagram_manage_messages` already shows a gate in our code**: `fetchInstagramDMs()` in
`src/lib/meta/dms.ts` catches Meta error `#230` and returns `[]` — that is the same missing
permission, and adding it fixes the existing Meta-assistant DM poller too.

While the app is in **Development mode**, these permissions work without review for users
with a role on the app (you). That is how to test §6 before submitting anything.

---

## 3. Subscribe the webhook

App Dashboard → **Products → Messenger → Instagram settings** (or **Webhooks** → pick the
`instagram` object):

1. **Callback URL**: `https://jmtos.ionicx.ai/api/meta/instagram-webhook`
2. **Verify token**: the exact value you set for `IG_VERIFY_TOKEN`.
3. Click **Verify and save**. Meta sends a GET with `hub.mode=subscribe` and the route
   echoes `hub.challenge`. If it fails: the env var is missing on the deployed build, or
   there is a whitespace/typo mismatch. The route deliberately returns 403 rather than
   passing when the token is unset.
4. Subscribe to the field **`messages`**. That is the only one this route handles.
   - Do **not** subscribe `message_echoes` — the route ignores echoes anyway, and it just
     doubles the traffic.
   - `messaging_postbacks`, `message_reactions`, `messaging_seen`, `standby` are optional
     and currently ignored (see §7).
5. **Connect the Instagram account / Page.** In Messenger → Instagram settings, generate a
   Page access token for the linked Page and enable message control. Under the hood this is
   `POST /<PAGE_ID>/subscribed_apps?subscribed_fields=messages` — subscribing the field in
   the dashboard alone is not enough; the **Page** must also be subscribed to the app.
6. In the **Instagram app** itself: Settings → Business tools and controls → **Allow access
   to messages** must be ON. If the account owner has this off, Meta sends nothing and every
   other step above looks correct.

Confirm afterwards: the app's webhook subscription list should show `instagram → messages`
alongside `whatsapp_business_account → messages`. Today it shows only the WhatsApp one.

---

## 4. App Review — what they will ask for

`instagram_manage_messages` is not a self-serve permission. Submission needs:

- **Business Verification** on the Meta Business account (Jai Muay Thai Pte. Ltd., UEN
  `202239849D`). If this is not already done for this business it is the long pole.
- **A screencast** showing the whole flow end to end: a person DMs @jaimuaythai from a
  normal Instagram account → the message appears in JMT OS → a reply is sent back → it
  arrives in Instagram. Record it in Development mode with a test account.
- **A written use case**: "We reply to customer enquiries received in Instagram Direct on
  behalf of the business (class schedule, pricing, trial bookings). Messages are answered by
  a business assistant and escalated to a human coach." Say plainly that it is an assistant —
  do not describe it as a broadcast or marketing tool; Meta rejects promotional messaging use
  cases for this permission.
- **Privacy policy URL** — `https://jmtos.ionicx.ai/privacy` (exists) or the public site's.
- Confirmation the app complies with the **Messenger Platform and Instagram Messaging API
  Policy** — in particular no promotional content outside the 24-hour window.
- Reviewers may need **test credentials / a test Instagram handle** to reproduce.

Expect days, not hours. Everything in §6 can be tested before submitting, in Development
mode, with your own account.

---

## 5. How the reply is sent (so nobody "fixes" it wrongly)

Because the IG account is **linked to a Facebook Page**, we send with the *Messenger*
endpoint, not `graph.instagram.com`:

```
POST https://graph.facebook.com/v21.0/<META_PAGE_ID>/messages?access_token=<META_PAGE_TOKEN>
{ "recipient": { "id": "<IGSID from the webhook>" },
  "messaging_type": "RESPONSE",
  "message": { "text": "..." } }
```

This is the existing `postDmReply()` in `src/lib/meta/dms.ts` — reused, not forked.

**The 24-hour window.** A customer's message opens a 24-hour Standard Messaging Window; a
`RESPONSE` message is only allowed inside it. This route always replies to a DM that just
arrived, so the window is open by construction and no message tag is needed. A delayed or
proactive send would need the `HUMAN_AGENT` tag (7 days), which itself needs the Human Agent
feature approved. We do not do proactive Instagram sends.

**Error codes** (Meta's table, surfaced to Telegram by `describeSendError()`):

| Code | Meaning | Fix |
|---|---|---|
| 10 | Permissions error | `instagram_manage_messages` / `pages_messaging` missing — §2 |
| 100 | Invalid parameter | Wrong recipient id (must be the IGSID from the webhook) |
| 190 | Token expired | Regenerate `META_PAGE_TOKEN` |
| 551 | Person not available | They blocked us / deleted the thread — nothing to fix |
| 613 | Rate limited | Back off |
| 230 | (on the DM poller) | Same missing `instagram_manage_messages` |

---

## 6. Testing end to end

1. Deploy with `IG_VERIFY_TOKEN` set and **`JAI_IG_AUTOREPLY` unset**.
2. Meta App Dashboard → Webhooks → `instagram` → **Test** on the `messages` field. Meta
   sends a *signed* sample payload. Expect `200 {"ok":true}` and nothing else — the sample
   sender id is fake, so nothing is sent back.
3. **Negative test — this is the one that matters.** `curl -X POST` the endpoint with no
   `X-Hub-Signature-256` header. It must return **403**, not 200. If it returns 200 the
   signature check is not doing its job and anyone can make JAI talk.
4. From a *different* Instagram account, DM @jaimuaythai. Expect within seconds:
   - a **Telegram ping** to Jeremy: `Boss, Instagram DM (IGSID …)`,
   - the thread in **JMT OS → Meta assistant → DMs**, status `pending`,
   - the message in `jai.conversations` under `contact_number = ig:<IGSID>`,
   - **no reply**, because the kill switch is off.
5. Set `JAI_IG_AUTOREPLY=1`, redeploy, DM again. Now JAI should answer from the same fact
   sheet as WhatsApp. Send the real 2026-09-02 message verbatim and check the answer against
   the fact sheet — beginner + packages must produce the adult rate card and the $42 drop-in,
   never a free adult trial (paused) and never a promo figure.
6. Reply to yourself from the Instagram Business inbox and confirm JAI does **not** answer
   its own message (echo filter).
7. Check `jai.processed_messages` has one row per `mid` with `handled = true`.

**To turn JAI off on Instagram again:** unset `JAI_IG_AUTOREPLY` (whole channel), or hit
**Dismiss** on the thread in the Meta assistant tab (that one thread only).

---

## 7. Known gaps — read before trusting this

- **No sender name.** The `messages` webhook carries only the IGSID, no username. Threads
  show as `ig:<IGSID>`. Resolving the name needs a separate User Profile API call
  (`GET /<IGSID>?fields=name,username`) with `instagram_manage_messages`; not built.
- **No member recognition.** An IGSID cannot be matched to a phone number, so JAI treats
  every Instagram contact as a non-member. Trial "Done" verification, membership lookup and
  the trial-reminder flow are WhatsApp-only.
- **Ignored event types**: media-only DMs (logged + alerted, not answered), story replies,
  reactions, postbacks, referrals, `standby`. None of them break anything; they are just not
  handled.
- **Anti-loop guard is partial.** The full guard lives inline in the WhatsApp route and
  could not be imported without editing that file. Instagram has only the narrow "never send
  the identical message twice in a row" slice. Extracting the real one into a shared module
  is a follow-up.
- **No per-thread AI pause row.** WhatsApp uses `jai.leads.ai_paused`; this route
  deliberately never writes `jai.leads`, because the lead-followup cron WhatsApp-nudges every
  row in it and an IGSID is not a phone number. Dismiss is the per-thread off switch instead.
- **A thread can appear TWICE in the Meta assistant tab.** The existing poller
  (`/api/meta/refresh` → `fetchInstagramDMs`) keys `jai.meta_dms` on Meta's Graph
  conversation id; this webhook keys it on `ig:<IGSID>`. Once `instagram_manage_messages`
  is granted, the poller starts working too and the same conversation can land under both
  keys. Either stop polling Instagram in `fetchAllDMs()`, or key both on the IGSID. Decide
  this before turning `JAI_IG_AUTOREPLY` on — otherwise the poller may also draft a reply
  for a thread JAI has already answered.
- **`ig:` threads appear in the WA inbox list** (it reads `jai.conversations` directly).
  They are read-only there — `/api/wa-inbox/send` rejects them because there is no `jai.leads`
  row, so no WhatsApp message can be sent to an IGSID. Reply from the Meta assistant tab.
