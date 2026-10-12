export type ConversationRow = {
  role: string | null;
  via?: string | null;
  message: string | null;
  created_at: string | null;
};

export type FollowupEligibility = {
  eligible: boolean;
  reason?: string;
};

const HANDOFF_REPLY =
  /(?:let me|i(?:'|’)ll|we(?:'|’)ll|i have|i(?:'|’)ve|passing|flagged).{0,45}(?:coach\s+jeremy|the coach)|coach\s+jeremy.{0,45}(?:reach out|come back|get back|reply|confirm|sort|handle|help|contact)|hand(?:ing)?\s+(?:this|it|you)\s+(?:over|to)/i;

const CLOSED_BY_LEAD =
  /^(?:thanks?(?:\s+(?:you|jai))?|thank\s+you|no\s+thanks?|noted|okay|ok|alright|all\s+right|that(?:'|’)s\s+all|no\s+worries|take\s+care)[\s.!🙏🥊👍🙂]*$/i;

const DECLINE_OR_DEFER =
  /\b(?:too\s+far|very\s+far|can(?:not|'t)\s+(?:take|make|come|join)|won(?:'|’)t\s+be\s+joining|think\s+about\s+it|let\s+me\s+think|contact\s+(?:you|u)\s+again|once\s+i\s+(?:have\s+)?recover|still\s+unwell|not\s+the\s+right\s+time)\b/i;

const NON_CUSTOMER_ENQUIRY =
  /\b(?:commercial\s+leasing|leasing\s+(?:team|enquiry)|new\s+development|site\s+model|suitable\s+unit|estimated\s+top)\b/i;

const MEMBERSHIP_OR_JOIN =
  /\b(?:membership|sign\s*up|join(?:ing)?|enrol(?:l|ment)|package)\b|\b(?:six|twelve|6|12|monthly|annual)\s*(?:month\s*)?plan\b/i;

const RESCHEDULE =
  /\b(?:reschedul(?:e|ing)|re[- ]?schedul(?:e|ing))\b|\b(?:change|move|shift|postpone|push)\s+(?:my|our|the)\s+(?:trial|session|booking|appointment|slot)\b|\b(?:change|move)\s+(?:the\s+)?(?:date|time|day|slot)\s+(?:of|for)\s+(?:my|our|the)\s+(?:trial|session|booking|appointment)\b/i;

const EXPLICIT_HUMAN =
  /\b(?:speak|talk|chat)\s+(?:to|with)\s+(?:someone|somebody|a\s+(?:person|human|real\s+person)|coach(?:\s+jeremy)?|jeremy|a\s+coach|the\s+coach)\b|\b(?:coach\s+jeremy|jeremy|a\s+human|a\s+real\s+person)\b.{0,30}\b(?:call|contact|reach|message)\s+me\b|\b(?:real|actual)\s+(?:person|human)\b|\breal\s+reply\b|\b(?:coach\s+)?jeremy(?:['’]s)?\s+(?:contact|number|phone|whatsapp)\b/i;

export const HUMAN_TAKEOVER_TEXT =
  "Sure — I’m passing this to Coach Jeremy now and pausing my automated replies, so he can reply to you here directly.";

// Isaac, 2026-10-12: only an explicit "get me a person" pauses JAI. A reschedule
// or a live-availability question alerts Jeremy while JAI keeps answering
// (his 2026-07-25 rule: never leave the lead hanging), so these two texts must
// not promise a pause.
export const RESCHEDULE_TEXT =
  "No problem — I’ve let Coach Jeremy know you’d like to change your booking. Your current booking stays as it is until he confirms the new slot with you.";

export const OPERATIONAL_CONFIRMATION_TEXT =
  "I can share the scheduled class times, but I can’t confirm live availability, whether the gym is open right now, or whether a coach is on site. I’ve asked Coach Jeremy to confirm for you.";

export function detectHumanTakeoverIntent(text: string): boolean {
  return detectExplicitHumanRequest(text) || detectRescheduleIntent(text);
}

// "Can I reschedule if I can't make it?" / "What's your reschedule policy?" ask
// about the rule; they are not a request to move a booking (re-review 2026-10-12).
const RESCHEDULE_POLICY_QUESTION = /\bif\b|\bpolic(?:y|ies)\b|\ballow(?:ed)?\b|\blater\b|\bbefore\s+i\s+book\b|\bin\s+case\b|\bhow\s+(?:do|does|can)\b|\bcan\s+i\s+(?:still\s+)?reschedule\s*\?|\bis\s+(?:it\s+)?possible\b/i;

export function detectRescheduleIntent(text: string): boolean {
  return RESCHEDULE.test(text) && !RESCHEDULE_POLICY_QUESTION.test(text);
}

// "Do I need to talk to the coach before I join sparring?" asks HOW things work;
// it is not a request for a person (e2e OT1, 2026-10-12).
const PROCESS_QUESTION = /\b(?:do|should|must|would)\s+i\s+(?:need|have)\s+to\b|\bbefore\s+i\b|\bis\s+it\s+necessary\b/i;

export function detectExplicitHumanRequest(text: string): boolean {
  return EXPLICIT_HUMAN.test(text) && !PROCESS_QUESTION.test(text);
}

export function hasUnverifiedOperationalClaim(text: string): boolean {
  const statements = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((statement) => statement.trim())
    .filter(Boolean);

  return statements.some((statement) => {
    const isQualified =
      /\b(?:cannot|can't|can’t|unable\s+to|need\s+to|have\s+to|i(?:'|’)ll|we(?:'|’)ll)\s+(?:verify|confirm|check)\b/i.test(statement) ||
      /\b(?:confirm|check)\s+whether\b/i.test(statement);
    if (isQualified) return false;

    return (
      /\b(?:we(?:'|’)re|we\s+are|the\s+gym\s+is)\s+open\s+(?:now|right\s+now|today)\b/i.test(statement) ||
      /\bcoach\s+jeremy\s+(?:is|will\s+be)\s+(?:around|on\s*site|inside|available|there|expecting\s+you)\b/i.test(statement) ||
      /\bthat\s+timing\s+(?:(?:is|are)\s+)?(?:can|should|would|usually)?\s*(?:work|works|fine)\b/i.test(statement) ||
      /\b(?:(?:i|we)\s+will|i(?:'|’)ll|we(?:'|’)ll)\s+(?:give|make\s+sure).{0,35}\b(?:heads?\s*up|expecting\s+you)\b/i.test(statement) ||
      /\bsee\s+you\s+inside\b/i.test(statement) ||
      // A bare "we're open" is a live claim; "we're open Mon–Sat / from 7am" is timetable.
      /\bwe(?:'|’)re\s+open\b(?!\s+(?:mon|tue|wed|thu|fri|sat|sun|from|daily|every|on|until|till|\d))/i.test(statement) ||
      /\bwalk(?:ing)?\s*-?\s*in\s+is\s+(?:fine|ok|okay)\b/i.test(statement) ||
      /\bwe(?:'|’)ll\s+get\s+you\s+in\b/i.test(statement) ||
      /\bsee\s+you\s+up\s+there\b/i.test(statement)
    );
  });
}

export function evaluateFollowupEligibility(args: {
  history: ConversationRow[];
  anchorAt: number;
  answerBody: string;
  armedBy: "link" | "silent";
}): FollowupEligibility {
  const rows = [...args.history].sort(
    (a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime()
  );
  const atOrAfterAnchor = rows.filter(
    (row) => new Date(row.created_at ?? 0).getTime() >= args.anchorAt
  );
  if (atOrAfterAnchor.some((row) => row.role === "assistant" && row.via === "human")) {
    return { eligible: false, reason: "human replied after the follow-up anchor" };
  }

  const userBeforeAnchor = rows
    .filter(
      (row) =>
        row.role === "user" &&
        new Date(row.created_at ?? 0).getTime() <= args.anchorAt
    )
    .at(-1)?.message?.trim() ?? "";

  if (detectHumanTakeoverIntent(userBeforeAnchor)) {
    return { eligible: false, reason: "lead requested a human or booking change" };
  }
  if (CLOSED_BY_LEAD.test(userBeforeAnchor) || DECLINE_OR_DEFER.test(userBeforeAnchor)) {
    return { eligible: false, reason: "lead closed, declined, or deferred" };
  }
  if (NON_CUSTOMER_ENQUIRY.test(userBeforeAnchor)) {
    return { eligible: false, reason: "non-customer enquiry" };
  }
  if (MEMBERSHIP_OR_JOIN.test(userBeforeAnchor)) {
    return { eligible: false, reason: "membership or join intent needs its own handoff" };
  }
  if (HANDOFF_REPLY.test(args.answerBody)) {
    return { eligible: false, reason: "answer handed the conversation to Coach Jeremy" };
  }

  // Isaac, 2026-10-12: the "answer had no question" rule cut ~72% of silent-lead
  // nudges, including real leads ("What's the package" → link → never nudged).
  // Only closed / declined / handed-off / human-replied threads are skipped.
  return { eligible: true };
}
