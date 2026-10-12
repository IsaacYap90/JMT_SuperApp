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
  /\b(?:reschedul(?:e|ing)|re[- ]?schedul(?:e|ing))\b|\b(?:change|move)\b.{0,80}\b(?:session|trial|booking|appointment|date|time|slot)\b|\b(?:session|trial|booking|appointment|date|time|slot)\b.{0,80}\b(?:change|move)\b|\b(?:change|move)\b.{0,50}\bclass\b.{0,30}\b(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|today|tomorrow|\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i;

const EXPLICIT_HUMAN =
  /\b(?:speak|talk|contact|hear|reply)\b.{0,50}\b(?:coach\s+jeremy|coach|human|real\s+person)\b|\b(?:coach\s+jeremy|human|real\s+(?:reply|person|coach))\b.{0,50}\b(?:speak|talk|contact|call|reach|reply)\b|\b(?:automated|automatic|auto)\s+(?:reply|message|check[- ]?in)\b/i;

export const HUMAN_TAKEOVER_TEXT =
  "I’ll pass this to Coach Jeremy and pause the automated replies here. He’ll confirm directly — nothing has been changed or booked yet.";

export const OPERATIONAL_CONFIRMATION_TEXT =
  "I can share the scheduled class times, but I can’t verify live availability, whether the gym is open right now, or whether a coach is on site. I’ll pass this to Coach Jeremy and pause automated replies until he confirms.";

export function detectHumanTakeoverIntent(text: string): boolean {
  return EXPLICIT_HUMAN.test(text) || RESCHEDULE.test(text);
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
      /\b(?:that\s+timing|afternoons?|mornings?|evenings?)\s+(?:(?:is|are)\s+)?(?:can|should|would|usually)?\s*(?:work|fine|available)\b/i.test(statement) ||
      /\b(?:(?:i|we)\s+will|i(?:'|’)ll|we(?:'|’)ll)\s+(?:give|make\s+sure).{0,35}\b(?:heads?\s*up|expecting\s+you)\b/i.test(statement) ||
      /\bsee\s+you\s+inside\b/i.test(statement)
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

  if (args.armedBy === "silent") {
    const hasRealNextStep =
      /\?/.test(args.answerBody) ||
      /\b(?:tell me which|let me know which|which (?:day|time|slot)|want me to|would you like)\b/i.test(
        args.answerBody
      );
    if (!hasRealNextStep) {
      return { eligible: false, reason: "answer did not invite a next step" };
    }
  }

  return { eligible: true };
}
