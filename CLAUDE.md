## Confidence Rule (project-wide)

Do not make changes until you have 95% confidence in what to build. Ask follow-up questions until you reach that confidence. No writes/edits/deploys before then.

---

# JMT Dashboard — Coach + admin portal for Jai Muay Thai (Singapore)

## JAI — the JMT AI Assistant (naming — Isaac, 2026-07-04)
- **JAI is NOT a "bot". JAI = "JMT AI" — the JMT AI Assistant.** Refer to it as the JMT AI Assistant (or "Jai, Coach Jeremy's assistant"), never "the bot". It introduces itself as Coach Jeremy's / JMT's assistant, never "I'm a bot/chatbot".
- **Single source of truth for its facts: `src/lib/wa/jai-facts.ts`** (`JAI_FACTS`). The WhatsApp reply logic (`src/lib/wa/jai-reply.ts`) and the FB/IG drafts (`src/lib/meta/draft.ts`) both import from it — edit facts in ONE place. JAI must ONLY answer from the fact sheet; if something isn't in it, it escalates to Coach Jeremy (never guesses).

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
