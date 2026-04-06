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
