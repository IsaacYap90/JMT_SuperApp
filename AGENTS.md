## Confidence Rule (project-wide)

Do not make changes until you have 95% confidence in what to build. Ask follow-up questions until you reach that confidence. No writes/edits/deploys before then.

---

# JMT Dashboard — Coach + admin portal for Jai Muay Thai (Singapore)

## JAI — the JMT AI Assistant (naming — Isaac, 2026-07-04)
- **JAI is NOT a "bot". JAI = "JMT AI" — the JMT AI Assistant.** Refer to it as the JMT AI Assistant (or "Jai, Coach Jeremy's assistant"), never "the bot". It introduces itself as Coach Jeremy's / JMT's assistant, never "I'm a bot/chatbot".
- **See `JAI.md` for how JAI actually works — the two rulebooks, the guards, and the traps.** Read it before changing anything JAI says.
- 🛑 **Single source of truth for its facts is the Supabase `jai_facts` row (`key='facts'`), NOT the code.** Editing it is a DB change, live instantly, no deploy. `src/lib/wa/jai-facts.ts` (`JAI_FACTS`) has been **fallback only** since `e3330dd` (2026-08-27) — this line used to say the constant was the source of truth, and that staleness contributed to the 2026-09-02 incident where the code was changed to answer join questions while the fact sheet still ordered a one-line handoff. The WhatsApp reply logic (`src/lib/wa/jai-reply.ts`) and the FB/IG drafts (`src/lib/meta/draft.ts`) both import from it — edit facts in ONE place. JAI must ONLY answer from the fact sheet; if something isn't in it, it escalates to Coach Jeremy (never guesses).

## Tech Stack
Next.js 14 (App Router) | TypeScript | Tailwind | Supabase (DB + auth) | Vercel | Telegram Bot (notifications)

## Legal entity
- Jai Muay Thai Pte. Ltd. — UEN `202239849D` — Singapore-registered (ACRA). Use this for any privacy policy / legal / Meta app / dev account reference.

## Supabase
- Project URL: `https://xioimcyqglfxqumvbqsg.supabase.co`
- Auth: `auth.users` ↔ `public.users` (linked by id). `public.users.role` = `coach` | `admin` | `master_admin`

## Hosting
- Production: deployed to Vercel project `isaacs-projects-14fce6f6/dashboard` → jmtos.ionicx.ai
- Project path: `~/Projects/jmt/super-app/` (capital P; the old `~/projects/jmt/dashboard/` path is stale)
- Deploys are **CLI** (`vercel --prod` from the working tree), NOT git-integration. So the live commit is whatever tree was deployed — **always confirm the live SHA via the Vercel API deployment `meta.githubCommitSha` before basing a deploy branch** (2026-07-20: a main-based branch nearly wiped 11 live commits; live lineage was feat/ui-redesign c0a2b35 → chore/jai-improvements-live → feat/forgot-password ee11399).
- **MANDATORY before any prod deploy: the full `/predeploy jmt` pipeline.** A PreToolUse hook (`~/.claude/hooks/predeploy-gate.sh`) hard-blocks `vercel --prod` without a fresh pipeline pass — no phrasing from anyone skips it.

## Meta webhook secrets (2026-07-20 outage lesson — do not "simplify")
- Two Meta apps sign our webhooks with DIFFERENT secrets: WhatsApp = "JMT AI Bot" → `META_APP_SECRET`; Lead Ads = "JMT Leads" → `LEADS_APP_SECRET` (fallback to META_APP_SECRET). `verifyMetaSignature(raw, header, secretOverride?)` in `src/lib/meta-webhook.ts`.
- Never point both webhooks at one secret env — fixing one silences the other (JAI went deaf 20:42–21:00 on 2026-07-20 exactly this way).

## Alerting to Isaac — Telegram, never freeform WhatsApp (2026-07-25 lesson)
- A freeform WA send (`sendText` in `src/lib/wa/jai-send.ts`) only delivers inside Meta's **24-hour customer-service window**. Outside it Meta rejects, `sendText` swallows the failure into a `console.error` and returns `false`, and the caller happily reports success. **Any alert/health-check/report to Isaac must go to Telegram** (`JMT_TELEGRAM_BOT_TOKEN` + `WATCHDOG_TG_CHAT_ID`, see `src/app/api/cron/lead-pipeline-watchdog/route.ts`) **or use a pre-approved template.** Caught by `/predeploy` before it shipped.
- Telegram sends carrying model-generated text: omit `parse_mode`. Interpolated/truncated LLM output can contain unbalanced `*` `_` `<` and will 400 an HTML/Markdown send, losing the alert.
- Crons doing slow work must `export const maxDuration` (siblings use 60) — a timeout longer than the function duration can never fire.
- `/api/cron/jai-canary` (daily 09:15 SGT) exercises the real JAI reply path and reports pass/fail every run. Silence = the canary is down. `?dry=1` skips the send.

## Auth (added 2026-07-20)
- Coach self-serve password reset: `/forgot-password` → Supabase recovery email → `/reset-password` (handles PKCE `?code=` AND implicit `#fragment` tokens via explicit setSession — the @supabase/ssr PKCE client does NOT consume hash tokens itself). Supabase auth config: site_url=https://jmtos.ionicx.ai, uri_allow_list=…/reset-password. Built-in mailer only (~2-4 emails/hr) — custom SMTP if volume ever matters.

## Hard Rules
- **Never assume anything. Always ask before taking action. Always confirm with Isaac first.** Default mode: **Mode B** — free to read, search, grep, fetch; ask before any write, edit, deploy, delete, commit, push, or outbound message. (Set 2026-04-08.)
- For ALL changes, build a Cloudflare Tunnel review link and wait for Isaac's approval before deploying to production
- Always run `npm run build` before finishing — must be green
- Never modify `.env.local`. Use `vercel env add` for production env vars
- Half-day leave at JMT supports MORNING or EVENING half (NOT a generic AM/PM split): morning = off before 6:30pm / teaching evening (the default + legacy behaviour); evening = teaching earlier classes / off from 6:30pm. Stored in `leaves.half_day_period` ('morning'|'evening'; null = full day or legacy half-day, treated as morning).
- Distinct from `~/projects/jmt/jai-bot/` (separate WhatsApp chatbot project)

## Skills (slash commands)
- `/jmt-leave` — Leave system (entitlements, half-day rule, conflict detection, notifications)
- `/jmt-pt` — Personal training sessions (booking, status, coach reschedule)
- `/jmt-classes` — Recurring classes, schedule grid, coach assignments
- `/jmt-trials` — Trial management + trial settings
- `/jmt-meta-leads` — Meta Lead Ads pipeline: webhook, token refresh, app publish flow
- `/jmt-calendar` — ICS calendar feed: RRULE/EXDATE, SGT timezone, PT deep-links
- `/jmt-structure` — Project structure (routes, tables, server actions, components)
- `/jmt-gotchas` — Class-of-bug notes (HH:MM:SS string compare, SGT timezone construction, Supabase join cardinality, notifications type constraint, half-day rule). Read before touching leave/PT/classes code.

## Reply Style
- No explanation. Answer only. Caveman mode. Under 100 words.

## Filmed-demo mode (built 2026-07-27, env-gated OFF, uncommitted)
For screen-recording without exposing real client PII.
- `src/lib/demo-mask.ts` — deterministic fake names/SG numbers/emails; EXACT
  identity passthrough when off.
- `src/lib/demo-wa-fixture.ts` — 6 fully synthetic WA conversations. The inbox is
  REPLACED, not masked, because real first names appear inside message bodies
  ("Welcome Gwen") and no regex catches every name in free text.
- ⚠ **`process.env.DEMO_MODE` is `undefined` in the browser.** A client component
  reading it silently no-ops, and if the server renders a fixture the client does
  not, you get a hydration error. Read the flag in the SERVER component
  (`wa-inbox/page.tsx`) and pass it down as a prop. Do not rely on `NEXT_PUBLIC_`.
- ⚠ **Demo replies MUST follow `src/lib/wa/jai-facts.ts`.** A first attempt
  invented a "$20 trial" (trials are FREE — never quote a trial fee) and promised
  a specific trial time (Calendly is the ONLY source of availability). Both are
  documented hard rules. A demo video showing that misrepresents the product.
- Activate with `DEMO_MODE=1` inline on the dev-server launch. Do NOT put it in
  `.env.local` (hard rule: never modify .env files).
