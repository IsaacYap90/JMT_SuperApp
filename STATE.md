# STATE — JMT OS (Jai Muay Thai Super App)

> The loop reads this at the start of every run and writes to it at the end.
> Keep it short. Delete anything that no longer changes a decision.
> Last updated: 2026-07-09 · Owner: Isaac

## 1. Verified facts
*Confirmed by a real check (command output / DB / rendered page). Not assumptions.*

- **This IS the live JMT OS**: `~/Projects/jmt/super-app` (capital P). Next.js 14.2.35 App Router + TS + Tailwind + Supabase `xioimcyqglfxqumvbqsg`. GitHub `IsaacYap90/JMT_SuperApp`, Vercel project **"dashboard"** → **jmtos.ionicx.ai**. — verified via `git remote -v` + `package.json`, 2026-07-09.
- **Prod deploys from `main`.** Current working branch = `feat/ui-redesign` with 17 uncommitted files; prod was shipped from this branch via `vercel --prod`, so **`main` is BEHIND the live site**. — `git status` / `git branch`, 2026-07-09.
- **NOT this app**: `~/projects/jaimuaythai` (the marketing website) and `~/projects/jai-muaythai-app` (old Expo + Vite web-admin). Editing those for jmtos work is the classic wrong-target mistake.
- JAI bot conversation data lives in the **`jai` schema of the same Supabase** — the WA inbox reads it directly (no cross-app/iframe).

## 2. General rules
*From the repo's CLAUDE.md hard rules + Isaac's standing prefs. One line each.*

- `npm run build` must be green before finishing any change.
- Preview before deploy — run **/deploy-guard** first (live-SHA ancestor + route-drop check).
- **Never merge/push to `main` without an explicit "ship it" that turn.** Deploys are Mode-B gated.
- Never edit `.env.local`.
- **No emoji in the UI** — SVG line icons only.
- WhatsApp bold = single asterisk (`*bold*`), not `**bold**`.

## 3. Open failures / in-flight
*Each with the exact next step.*

- [ ] `feat/ui-redesign` — 17 files uncommitted but live on prod. Next step: commit + push the branch, then decide a sync-to-`main` PR (only on Isaac's "ship it").
- [ ] WA bot reply model = **DeepSeek** (`deepseek-chat`), not Haiku — the Anthropic API key has $0 credit (per memory 2026-07-08, not re-verified today). To switch to Haiku: top up Anthropic credits, then swap the model back in `src/lib/wa/jai-reply.ts`.

## 4. Lessons learned
- **Live JMT OS = `~/Projects/jmt/super-app`, capital P.** A lowercase `~/projects/` search silently misses it (Linux is case-sensitive) and lands you on the marketing site. Caught this session, 2026-07-09. (memory's `~/projects/jai-muaythai-app` path was stale.)
- WA-inbox + webhook features once sat uncommitted and never reached prod (which deploys from `main`). **Write/commit before you walk away** — uncommitted work is invisible to prod.

---
### Loop protocol (Fail → Investigate → Verify → Distill → Consult)
1. **Fail** — run the goal; log what broke in §3.
2. **Investigate** — root cause, not symptom.
3. **Verify** — confirm the fix with a real check; move it to §1.
4. **Distill** — write the general rule into §2.
5. **Consult** — reusable across projects? Migrate to `~/.claude/skills/`; note in §4.

**Write before you walk away.** A fact learned and not written here is lost next session.
