# JMT OS — Design System

*Single-file design system for any AI coding agent before generating UI inside the JMT Dashboard (coach + admin portal for Jai Muay Thai).*

## Brand voice

Operator-first. Fast, dense, no decoration. Coaches and admins are checking sessions / leads on their phones between rounds — every screen needs to be readable in glance-mode.

## Palette

Defined in `tailwind.config.ts` as `jai-*` tokens.

| Role | Token | Hex | Use |
|---|---|---|---|
| Bg | `jai-bg` | `#000000` | True black page bg |
| Card | `jai-card` | `#121212` | Card / tile bg |
| Border | `jai-border` | `#1E1E1E` | Card borders, separators |
| Brand blue | `jai-blue` | `#0096FF` | Primary accent — CTAs, links, status pills |
| Text dim | `jai-text` | `#B3B3B3` | Secondary text |
| White | `#FFFFFF` | white | Primary text on black |

Status colours (use Tailwind defaults, no custom tokens):
- Success / present: `text-green-500`
- Warn / pending: `text-yellow-500`
- Error / missed / cancelled: `text-red-500`
- Info / scheduled: `text-blue-400`

## Typography

- **Single font:** Inter (sans). Body, headings, labels, all use it.
- No serif. No display font.

Scale:
- Page title: `text-2xl font-bold`
- Section header: `text-lg font-semibold`
- Body: `text-sm` or `text-base`
- Pill / label: `text-xs uppercase tracking-wide font-semibold`
- Number / count: `text-3xl font-bold` (for stats)

## Spacing

- Page padding: `px-4 py-4` mobile, `px-6 py-6` desktop
- Card padding: `p-4`
- Stack: `space-y-3` inside cards, `space-y-6` between sections

## Components

### Card
```tsx
<div className="bg-jai-card border border-jai-border rounded-xl p-4">
```
Always rounded-xl, jai-border, jai-card bg. Hover: `hover:border-jai-blue/50` for clickable cards.

### Primary CTA
```tsx
<button className="bg-jai-blue text-white font-semibold px-4 py-2 rounded-lg hover:bg-blue-500">
```
Solid blue. Rounded-lg. No glow / no gradient.

### Secondary CTA
```tsx
<button className="border border-jai-border text-white font-medium px-4 py-2 rounded-lg hover:border-jai-blue">
```

### Status pill
Small uppercase pill:
```tsx
<span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/30">
  Confirmed
</span>
```
Use `bg-{color}/10 text-{color}-400 border-{color}/30` pattern.

### Time / countdown
Mono-feel for time strings:
```tsx
<span className="font-mono text-jai-text">15:30</span>
```

## Page motifs

### Dashboard home (Next Up strip)
Top of page = "Next Up" with countdown to next PT/class. Card with countdown in big bold, name + time below.

### Lead pipeline
Vertical list cards. Status pill top-right. Quick-actions on right (call, message, mark done). New leads get green "Just in" badge for 10 seconds.

### Calendar grid
Day grid for classes/PT. Each cell = card. Past sessions dim to 60% opacity. Cancelled = red strikethrough.

### Audit log
Long list, monospace timestamps, action-noun-noun pattern: `2026-04-27 09:31 · Isaac → updated PT session #1234`.

## What to NEVER do

- NO white bg — JMT OS is a dark-mode-only dashboard
- NO purple, teal, pink — only blue + status colours
- NO long text passages on cards — every card should be glance-readable
- NO emojis except in user-generated content (lead names, message previews)
- NO drop-shadows on cards — borders only, flat
- NO confirmations for safe actions — only for destructive (cancel, delete)
- NO half-day = AM/PM split. Half-day at JMT = "off before 6:30pm, teaching evening." This is a HARD RULE — see CLAUDE.md and `/jmt-leave` skill.
- NO storing personal-DM content from coach/admin chats anywhere

## Timezone & locale

- All times displayed in **SGT** (Asia/Singapore), even though servers are UTC. Use the SGT timezone helpers in `lib/`.
- ISO times in DB → format on render with the SGT helper, NEVER raw `new Date().toLocaleString()`.

## Skills (slash commands) that already encode UI patterns

When generating dashboard pages, defer to the existing skills:
- `/jmt-leave` — leave system patterns
- `/jmt-pt` — personal training session patterns
- `/jmt-classes` — recurring class grid
- `/jmt-trials` — trial booking flow
- `/jmt-calendar` — ICS feed + calendar UI
- `/jmt-gotchas` — class-of-bug notes (read this BEFORE touching leave/PT/classes code)

## Reference

- Production: `dashboard-dun-eta-82.vercel.app` (Vercel project alias)
- The custom domain `dashboard.jaimuaythai.com` is NOT live — DNS still on GoDaddy, Jeremy hasn't transferred
- Source: `~/Projects/jmt/dashboard/` on neoclaw, repo `IsaacYap90/JMT_SuperApp`
- Avoid the duplicate clone at `~/Projects/jmt/super-app` — it's stale, see `feedback_jmt_super_app_clone_deprecated.md`

## Update policy

Keep this in sync with `tailwind.config.ts` + `globals.css`. Update in the same PR as any palette/component change.
