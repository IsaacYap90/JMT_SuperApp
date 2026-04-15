# JMT Meta Leads — Setup, Token Refresh, App Publish

End-to-end recipe for the Facebook/Instagram lead form → JMT OS Leads tab pipeline. Paired with `jmt-gotchas` sections 8–10 (symptoms/fixes) — this skill is the "how to do" guide.

## What the pipeline does

1. Lead fills the JMT Lead Ads form on FB or IG.
2. Meta POSTs to `/api/meta/lead-webhook` with `{form_id, leadgen_id, page_id}`.
3. Webhook uses `META_PAGE_ACCESS_TOKEN` to fetch the full lead from Graph API.
4. Webhook inserts a row into `trials` (or wherever the leads tab reads from) with name/phone/email/interest.
5. JMT OS Leads tab displays it on next poll.

## Env vars (Vercel, Production)

| Name | What it holds |
|------|--------------|
| `META_PAGE_ACCESS_TOKEN` | Never-expiring Page token for JMT Facebook Page |
| `META_APP_SECRET` | Used for webhook signature verification |
| `META_VERIFY_TOKEN` | Random string echoed back on webhook subscribe handshake |

Set via Vercel REST API when the CLI refuses "all Preview envs" interactively (see `reference_vercel_env_cli_quirk`):

```bash
curl -X POST "https://api.vercel.com/v10/projects/$PROJECT_ID/env?upsert=true" \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"key":"META_PAGE_ACCESS_TOKEN","value":"EAAG...","type":"encrypted","target":["production","preview","development"]}'
```

## Token refresh recipe (when Meta invalidates the token)

1. **Graph API Explorer** (developers.facebook.com/tools/explorer) — select the JMT Leads app.
2. Grant: `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`, `leads_retrieval`, `pages_manage_ads`.
3. Generate User Access Token. This is short-lived (1hr).
4. **Access Token Debugger** → paste the 1hr token → **Extend Access Token** → get a 60-day User token.
5. Back in Explorer, swap to the 60-day User token and GET `/me/accounts?fields=id,name,access_token`.
6. Copy the `access_token` for the JMT Page from the response — **this is a never-expiring Page token**.
7. Upsert it to Vercel as `META_PAGE_ACCESS_TOKEN` (see above).
8. Redeploy prod so the new env var propagates.

Do NOT store the User token and call `/me/accounts` at request time — it expires. Always resolve to the Page token at admin-time and bake that into env.

## App publish flow (Meta Developer Console)

Required before Meta will deliver real webhook events (testing panel fires green but delivers nothing to Unpublished apps — gotcha §10).

**Blockers that must be satisfied on App Settings → Basic:**
- App icon 1024×1024 (JMT logo — use `/public/jmt-icon.png` rescaled)
- Category: Business and Pages
- App domain: `dashboard-dun-eta-82.vercel.app` (or custom domain if set)
- Privacy Policy URL: `https://{prod-domain}/privacy` (no anchor fragment — Meta rejects `#section-7`)
- Data Deletion URL: same as privacy URL, plain — no fragment
- Contact email: `info@jaimuaythai.com`

**Publish step:**
- Left nav → Publish → **Publish** button.
- If all permissions show "Ready for testing" that's standard access — enough for your own Page.
- Advanced Access (formal review with screencast + use case) only needed if you want to access Pages you don't own. Skip for JMT.

## Testing the webhook

Three-step validation (gotcha §10):

1. Meta App Dashboard → Webhooks → Send test → expect `200 {"ok":true,"processed":1}` in the receiver.
2. `curl -X POST` a real-shaped payload to the endpoint (see gotcha §10 snippet).
3. Actual FB/IG lead form submission → row appears in `trials` table within seconds.

If (1) and (2) pass but (3) fails → app is Unpublished or the subscription is scoped to test users only.

## Form field mapping (gotcha §8)

When Jeremy/marketing spin up a new Lead Ads form, field names may differ. Before trusting the webhook:

```bash
curl "https://graph.facebook.com/v21.0/{leadgen_id}?fields=field_data&access_token=$META_PAGE_ACCESS_TOKEN"
```

Eyeball the returned field names. Add unfamiliar names to the fallback chain in `fetchLeadData()` at `src/app/api/meta/lead-webhook/route.ts`. Current fallback chain for phone:

```ts
phone: get("phone") || get("phone_number") || get("contact_no") || get("contact") || get("mobile") || ""
```

## Where it lives

- Webhook receiver: `src/app/api/meta/lead-webhook/route.ts`
- Privacy policy (Meta blocker): `src/app/privacy/page.tsx`
- Middleware allowlist for `/api/meta/*` and `/privacy`: `src/lib/supabase/middleware.ts`

## Related

- `jmt-gotchas` §8 — form field aliases
- `jmt-gotchas` §9 — User vs Page token confusion
- `jmt-gotchas` §10 — webhook testing panel lies
- `jmt-trials` — where leads land (Leads tab reads `trials`)
