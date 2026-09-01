// Round-5 e2e harness: replays REAL customer threads through the same path the
// WhatsApp webhook takes, minus every outbound side effect.
// NO WhatsApp sends, NO DB writes, NO Telegram. Read-only.
import { generateReply } from "../src/lib/wa/jai-reply.ts";
import { buildDeterministicAnswer } from "../src/lib/wa/deterministic-answers.ts";
import { getJaiFacts } from "../src/lib/wa/jai-facts.ts";
import {
  detectJoinIntent,
  hasDisallowedPrice,
  hasDeadAdultLink,
  JOIN_HANDOFF_TEXT,
  PAUSED_ADULT_TRIAL_TEXT,
} from "../src/lib/wa/join-intent.ts";

const facts = await getJaiFacts();

// One customer turn, replicating route.ts POST order.
async function turn(state, text) {
  if (state.paused) return { path: "PAUSED (Jeremy took over)", text: "(no reply sent)", esc: null };
  const isNewContact = state.history.length === 0;
  const joinHit = detectJoinIntent(text);

  // Layer 2
  if (!joinHit && !isNewContact) {
    const det = buildDeterministicAnswer(text, facts);
    if (det && !(det.intent === "PRICE" && state.isMember)) {
      state.history.push({ role: "user", message: text });
      state.history.push({ role: "assistant", message: det.messageText });
      return { path: `LAYER2 ${det.intent}`, text: det.messageText, quick: det.quickReplies, esc: null };
    }
  }

  const history = [...state.history, { role: "user", message: text }];
  let r;
  let path;
  if (joinHit) {
    r = { messageText: JOIN_HANDOFF_TEXT, quickReplies: [], escalation: { escalation: "JOIN_INTENT", intent: joinHit, source: "guard" }, member: false };
    path = `JOIN_GUARD(${joinHit})`;
  } else {
    r = await generateReply(history, isNewContact, state.name, state.isMember, state.contactContext);
    path = "MODEL";
  }

  const priorBot = state.history.filter((m) => m.role === "assistant");
  const prevBotMsg = [...priorBot].reverse()[0]?.message || "";
  const resendingLink = /calendly\.com\//i.test(r.messageText) && /calendly\.com\//i.test(prevBotMsg);
  const dragging = priorBot.length >= 8;
  const forceHandoff = (resendingLink || dragging) && (!r.escalation || r.escalation.escalation === "GENERAL_ESCALATION");

  let outText = forceHandoff ? "Let me get Coach Jeremy to sort this out for you directly 🙏 He'll reach out to you shortly." : r.messageText;
  let outQuick = forceHandoff ? [] : r.quickReplies;
  let esc = forceHandoff ? { escalation: "GENERAL_ESCALATION", intent: resendingLink ? "loop_break" : "conversation_stuck", source: "guard" } : r.escalation;
  if (forceHandoff) path += " +ANTILOOP";

  if (esc?.escalation !== "JOIN_INTENT" && hasDisallowedPrice(outText)) {
    esc = { escalation: "JOIN_INTENT", intent: "price_blocked", source: "guard" };
    path += " +PRICE_BLOCK";
  }
  if (esc?.escalation === "JOIN_INTENT") {
    outText = JOIN_HANDOFF_TEXT;
    outQuick = [];
    state.paused = true;
  }
  if (hasDeadAdultLink(outText)) {
    outText = PAUSED_ADULT_TRIAL_TEXT;
    outQuick = [];
    path += " +DEAD_LINK_BLOCK";
    if (!esc || esc.escalation === "GENERAL_ESCALATION") esc = { escalation: "GENERAL_ESCALATION", intent: "dead_adult_link_blocked", source: "guard" };
  }

  state.history.push({ role: "user", message: text });
  state.history.push({ role: "assistant", message: outText });
  if (r.member) state.isMember = true;
  return { path, text: outText, quick: outQuick, esc };
}

const THREADS = JSON.parse(process.env.THREADS);
for (const t of THREADS) {
  const state = { history: [], name: t.name ?? null, isMember: !!t.isMember, contactContext: t.ctx ?? "", paused: false };
  console.log(`\n################ ${t.id} ################`);
  for (const msg of t.msgs) {
    const r = await turn(state, msg);
    console.log(`\n>>> CUSTOMER: ${msg}`);
    console.log(`[path: ${r.path}]${r.esc ? ` [esc: ${r.esc.escalation}/${r.esc.intent}]` : ""}${r.quick?.length ? ` [buttons: ${r.quick.join(" | ")}]` : ""}`);
    console.log(`<<< JAI: ${r.text}`);
  }
}
