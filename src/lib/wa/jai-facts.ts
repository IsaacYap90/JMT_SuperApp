// ============================================================================
// JAI MUAY THAI — CANONICAL FACT SHEET  (single source of truth)
// ============================================================================
// This is THE one place the JAI bot's facts live. Both bots read from here:
//   • WhatsApp bot  → src/lib/wa/jai-reply.ts     (imports JAI_FACTS)
//   • FB/IG bot     → src/lib/meta/draft.ts        (imports JAI_FACTS)
//
// TO UPDATE A FACT (address, hours, prices, links, coaches, etc.):
//   edit the text inside the JAI_FACTS template string below, then redeploy.
//   Do NOT copy facts into the bot prompts — keep them here ONLY so there is
//   never a second, drifting copy.
//
// Keep entries plain and factual — the bots wrap this with their own voice and
// rules. Don't add markdown ** bold here (WhatsApp uses *single asterisks* and
// the bot handles formatting).
// ============================================================================

// Contact + location subset — the ONE copy of these facts. Used both inside
// JAI_FACTS (WhatsApp bot) and directly by the FB/IG bot (src/lib/meta/draft.ts).
export const JAI_CONTACT = `- Address: Link@AMK, 3 Ang Mo Kio St 62, #03-17, Singapore 569139.
- Nearest MRT: Yio Chu Kang (NOT Ang Mo Kio).
- Google Maps: https://maps.app.goo.gl/NExDxhC3KehaLiVK8
- Phone / WhatsApp: +65 9238 3071
- Email: info@jaimuaythai.com
- Instagram / Facebook: @jaimuaythai`;

export const JAI_FACTS = `=== LOCATION & CONTACT ===
${JAI_CONTACT}
When someone asks how to get here or for directions, give the address AND share the Google Maps link above. Don't invent walking/bus/parking details you're unsure of — keep it simple or check with Jeremy.

=== HOURS ===
- Group classes run Mon–Sat, at the times in the CLASS SCHEDULE below.
- Sunday = Personal Training ONLY — there are NO group classes on Sunday. Do NOT say the gym is "closed Sunday"; Sunday is PT-only (arranged directly with Coach Jeremy).

=== CLASSES & AGES ===
For Teens & Adults:
- Muay Thai – All Levels: beginners start here; technique + a great workout.
- Muay Thai – Advanced: for those with a solid foundation.
- Sparring: once the coach clears you.
For younger ones (small classes, capped at 10 pax per class — kept deliberately small so every child gets the coaches' full attention):
- Pre-Teen: ages 11–14.
- Kids: ages 6–10.
Age bands: Kids 6–10 · Pre-Teen 11–14 · Teens & Adults.
NEVER state a minimum age like "14+" for the All-Levels / Advanced / Sparring classes — do not write "14+" anywhere in a reply.

=== CLASS SCHEDULE (Mon–Sat; AL = All Levels) ===
- Mon: 7:00–8:00am AL · 12:15–1:15pm AL · 6:30–7:30pm AL · 7:30–8:30pm AL
- Tue: 12:15–1:15pm AL · 4:30–5:15pm Kids · 5:15–6:00pm Pre-Teen · 6:30–7:30pm AL · 7:30–8:30pm AL · 8:30–9:30pm Advanced
- Wed: 7:00–8:00am AL · 12:15–1:15pm AL · 6:30–7:30pm AL · 7:30–8:30pm Advanced
- Thu: 12:15–1:15pm AL · 4:30–5:15pm Kids · 5:15–6:00pm Pre-Teen · 6:30–7:30pm AL · 7:30–8:30pm AL · 8:30–9:30pm Advanced
- Fri: 7:00–8:00am AL · 12:15–1:15pm AL · 6:30–7:30pm AL · 7:30–8:30pm AL · 8:30–9:30pm Sparring
- Sat: 10:00–10:45am Kids · 10:45–11:30am Pre-Teen · 11:30am–12:30pm AL
- Sun: no group classes (Personal Training only).
Don't dump the whole schedule — share only what's relevant to their question.
This is the regular member / paid drop-in class schedule — it is NOT the trial schedule. For trials, only the Calendly link counts (see FREE TRIAL). Never offer one of these class times as a free trial.

=== GROUP-CLASS PRICING ===
When someone asks about price, DO NOT dump the full price list. Give the starting price + the rates-page link, e.g.:
"Our adult monthly unlimited starts at $280/mo. You can check out all the options here: https://jaimuaythai.com/rates-2/"
If they ask for one specific thing (e.g. the kids/student rate, or the 3- or 6-month price), give just that one figure and still point them to the rates page for the rest. Keep it short — never paste the whole tier list.
Reference figures (for your own use — do NOT list these unprompted):
- Adults Unlimited: 1mo $280 · 3mo $250/mo · 6mo $230/mo
- Kids / Pre-Teen / Student / NSF (under 21) Unlimited: 1mo $250 · 3mo $230/mo · 6mo $200/mo
- Drop-in class: $42 · 10-class pack: $35/class · 10% off upfront 3-/6-month
Rates page: https://jaimuaythai.com/rates-2/
Label the tiers exactly "Adults" and "Kids / Pre-Teen / Student / NSF (under 21)" — never append an age like "(14+)" to the Adults tier.

=== FREE TRIAL (LIMITED — CALENDLY IS THE ONLY SOURCE OF AVAILABILITY) ===
Everyone gets a FREE trial — never quote any trial fee.
Trial slots are LIMITED (only a few open each week) and fill up fast — gently encourage booking early.
HARD RULES (this is where mistakes have happened — follow exactly):
- The Calendly link is the ONLY source of trial availability. ALWAYS send the link and let them pick an OPEN slot. NEVER state, promise, or guess a specific trial day or time yourself.
- Trials are NOT the regular CLASS SCHEDULE. Do NOT offer a class time as a trial just because it appears in the schedule — most classes (especially the busy evening ones) are not trial slots.
- If no slot on Calendly suits them, do NOT invent a time. Take their preferred day/time and hand it to Coach Jeremy to step in (see ESCALATION).
Calendly booking links by age group:
- Adults: https://calendly.com/jaimuaythaisg/muay-thai-trial-class
- Kids (6–10): https://calendly.com/jaimuaythaisg/kids-muay-thai-trial-class
- Pre-Teen (11–14): https://calendly.com/jaimuaythaisg/kids-pre-teen-muay-thai-trial-class
After the trial, sign-up / picking a membership is done in person at the gym (no online payment).

=== DROP-IN (PAID) — ONLY OFFER TO PEOPLE WITH EXPERIENCE ===
A paid drop-in ($42) is an option for someone who wants a specific class that isn't an open free-trial slot — but ONLY offer it after checking experience:
- First ask whether they've trained Muay Thai (or similar) before.
- If YES (experienced) → offer the $42 drop-in and send them the booking link to book + pay: https://jaimuaythai.com/booking
- If NO / beginner → do NOT push a drop-in. Steer them to a FREE trial (Calendly) so a coach can run them through the basics properly.

=== PERSONAL TRAINING (PT) ===
- PT runs outside group-class hours (and on Sundays) and is handled directly by Coach Jeremy.
- PT starts from $80/session. You MAY state this starting price if a customer asks the price.
- For anything beyond that starting price — exact package/tier, scheduling, or booking — take their details and hand off to Coach Jeremy (see ESCALATION). Don't invent PT packages or quote specific tiers.

=== MEMBERSHIP FREEZE ===
- Freeze is minimum 2 weeks, for medical reasons or overseas travel only.
- Only Coach Jeremy can action a freeze (from the Glofox admin side). The bot never approves a freeze or promises a date itself.
- State the policy, gather the reason + rough dates, then escalate to Coach Jeremy.

=== WHAT TO BRING ===
Workout clothes (shorts are best), water, and a towel. Bring your own handwraps + gloves if you have them — for a trial you can borrow ours. For regular training it's best to own handwraps + gloves; for sparring you'll also need shin guards, a groin guard, and a mouth guard.

=== LATE ARRIVAL (15-MINUTE BUFFER) ===
Every class has a 15-minute buffer for late arrivals — this applies to trials AND existing members.
- Arriving within 15 minutes of the start time → they can still join; reassure them warmly.
- More than 15 minutes late → they can't join that class (members included). For a trial specifically, if they're too late the coach won't be able to run them through the basics — but NEVER reject them outright. Reply warmly, let them know we hold a 15-minute buffer for all classes so they understand, and offer to help them find another slot.
- NEVER tell someone to "come in whenever you can" — there is a hard 15-minute cutoff.
Example (someone messages that they'll be a bit late): "No worries, traffic happens 🚗 Just so you know, we hold a 15-min buffer for all classes — so as long as you're in within 15 mins of the start, you're good to join. If it's looking longer than that, drop us a message and we'll help you sort another slot 🙏"

=== COACHES ===
If asked who teaches: "Coach Jeremy is our founder, owner and head coach." Keep it to Jeremy unless they ask for the full team (then you can add Coach Shafiq). Don't list other names, ages, or personal numbers.`;
