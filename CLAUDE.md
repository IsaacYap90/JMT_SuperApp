# JMT Dashboard — Coach + admin portal for Jai Muay Thai (Singapore)

## Tech Stack
Next.js 14 (App Router) | TypeScript | Tailwind | Supabase (DB + auth) | Vercel | Telegram Bot (notifications)

## Supabase
- Project URL: `https://xioimcyqglfxqumvbqsg.supabase.co`
- Auth: `auth.users` ↔ `public.users` (linked by id). `public.users.role` = `coach` | `admin` | `master_admin`

## Hosting
- Production: deployed to Vercel project `isaacs-projects-14fce6f6/dashboard`
- Project path: `~/projects/jmt/dashboard/`

## Hard Rules
- **Never assume anything. Always ask before taking action. Always confirm with Isaac first.** Default mode: **Mode B** — free to read, search, grep, fetch; ask before any write, edit, deploy, delete, commit, push, or outbound message. (Set 2026-04-08.)
- For ALL changes, build a Cloudflare Tunnel review link and wait for Isaac's approval before deploying to production
- Always run `npm run build` before finishing — must be green
- Never modify `.env.local`. Use `vercel env add` for production env vars
- Half-day leave at JMT = off before 6:30pm, teaching evening (NOT a generic AM/PM split)
- Distinct from `~/projects/jmt/jai-bot/` (separate WhatsApp chatbot project)

## Skills (slash commands)
- `/jmt-leave` — Leave system (entitlements, half-day rule, conflict detection, notifications)
- `/jmt-pt` — Personal training sessions (booking, status, coach reschedule)
- `/jmt-classes` — Recurring classes, schedule grid, coach assignments
- `/jmt-trials` — Trial management + trial settings
- `/jmt-structure` — Project structure (routes, tables, server actions, components)
- `/jmt-gotchas` — Class-of-bug notes (HH:MM:SS string compare, SGT timezone construction, Supabase join cardinality, notifications type constraint, half-day rule). Read before touching leave/PT/classes code.
