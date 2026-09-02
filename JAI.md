# JAI — how the assistant actually works

Read this before changing anything JAI says or does.

Written 2026-09-02 after a night where three fixes to one behaviour each made it
worse in a new way. Every mistake below is one that was actually made, on live
customers, and the file exists so the next person does not repeat them.

---

## The one thing to understand: JAI has TWO rulebooks, and they can disagree

| | Where | Changing it |
|---|---|---|
| **The fact sheet** — what JAI knows and how it is told to behave | Supabase `jai_facts`, row `key='facts'` | **DB edit. Live instantly. NO DEPLOY.** |
| **The guards** — code that inspects and can replace JAI's answer before it sends | `src/lib/wa/*.ts`, `src/app/api/whatsapp/webhook/route.ts` | **Deploy.** |

**The failure that keeps happening is changing one and not the other.**

On 2026-09-02 the code was changed to let a join question be answered, while the
fact sheet still said *"Reply with ONE short warm line, nothing more."* The model
obeyed the sheet, the code appended its line on top, and a customer got the
handoff twice and no answer. Every test passed.

> **Before you ship a behaviour change, ask: does the sheet still instruct the
> old behaviour?** `grep` the sheet for the wording you are changing.

⚠ `src/lib/wa/jai-facts.ts` (`JAI_FACTS`) is **fallback only** since `e3330dd`
(27 Aug). Prod reads the DB row. Editing the constant alone changes nothing a
customer sees. (CLAUDE.md still called it the single source of truth until this
file was written.)

---

## The guards, and what each is actually for

Order matters — the first one that fires wins, and several return before the
model is ever called.

1. **`ai_paused`** — Jeremy has taken the chat over. JAI logs and says nothing.
   🛑 Nothing clears this automatically. 28 of 83 leads were stuck on it on
   1 Sep. See ISA-52.
2. **Late arrival** — the hard 15-minute cutoff, answered from the rule in code
   because the model kept getting the boundary backwards.
3. **Deterministic schedule / price** — class times and rates built from the
   sheet in code, so the model cannot invent one.
4. **Join intent** (`detectJoinIntent`) — the important split:
   - `promo_ask` / `quoted_promo_price` → **canned handoff, model never called,
     JAI pauses.** This is the 2026-07-29 "$252" rule and it must not be relaxed.
   - `wants_to_join` → **answered**, with the handoff appended as a closing line,
     and JAI keeps talking.
5. **Fact guard** — blocks any time, price or link not in the sheet.
6. **`hasDisallowedPrice`** — bins a reply quoting a figure off the rate card.
7. **Anti-loop** — hands over when JAI repeats itself. See the trap below.

---

## Traps that have each cost a real customer

**A guard that reads its own output will latch on.** The anti-loop guard was
changed to fire on "JAI is repeating itself", judged from the last two assistant
messages — which included its own handoff line. After firing twice it saw itself
repeating and fired forever. Ask of any guard: *what happens on the second
firing, when my own output is the input?*

**A bare number can be a class time AND a price.** 252 parses as 2:52. 600 is
both 6:00pm and a plausible monthly fee. `inboundHasUnknownFigure` exempts a
figure only when the adjacent word makes it a time ("1130 class"), not when
money is being discussed ("600 monthly").

**Counting for all time is not the same as counting this conversation.** The
anti-loop counter ran over every message ever, so 17 of 96 contacts had been
silently handed off forever. `sessionBotReplyCount` scopes it to a 6-hour gap —
including the gap to *now*, which the first version missed.

**The oldest twenty is not the newest twenty.** `.order("created_at", { ascending: true }).limit(20)`
gave the model month-old context for every returning customer.

**A handoff is not free.** Reading all 96 threads: the bare handoff fired 9 times
in August, three of those conversations died on the spot, and every one that
survived did so only because a human replied within ~15 minutes. Isaac's rule:
*"still quote the standard rate... dont go quiet on the lead."*

---

## Testing

- `npm run test:jai` — offline unit suites over the guards. Fast, free.
- `npm run test:jai:conversation` — drives the REAL webhook with a signed
  payload and asserts what JAI would send. Needs a build first.

🛑 **The conversation harness stubs the model.** A stubbed model cannot disobey
the fact sheet, so it cannot catch a sheet/code contradiction — the exact bug of
2026-09-02. Green here does not mean a real customer gets a good answer.

🛑 **Prove a check can FAIL before trusting it.** Break the code deliberately and
watch it go red. Three checks in this suite could not fail when first written;
one asserted the guards stripped a phone-call offer from a draft that never
contained one.

Switches in `src/lib/wa/harness.ts` stub the send and the model. Gated on
`VERCEL !== "1" && VERCEL_ENV !== "production"` plus an opt-in var — unreachable
on any deployment.

---

## Before you deploy

`/predeploy jmt` — the full pipeline, not just the scripts. On the night of
1–2 Sep it BLOCKED three times and was right every time; **both regressions that
reached a customer were changes pushed with only the deterministic tier because
it was late.** Tiredness is when the gate matters most.
