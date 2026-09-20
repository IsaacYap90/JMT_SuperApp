import { parsePricing } from "./deterministic-answers";

export type FollowupFacts = {
  price: string;
  bookingUrl: string;
};

export type FollowupFactsResult =
  | { ok: true; value: FollowupFacts }
  | { ok: false; reason: string };

/**
 * Pull the two customer-facing follow-up facts from the canonical DROP-IN
 * section. This parser is deliberately strict: a moved, duplicated, or
 * inconsistent fact must stop the cron rather than make it guess.
 */
export function extractFollowupFacts(facts: string): FollowupFactsResult {
  const lines = facts.split(/\r?\n/);
  const headers = lines
    .map((line, index) => ({ line: line.trim(), index }))
    .filter(({ line }) => /^=== DROP-IN \(PAID, \$\d+(?:\.\d{2})?\).* ===$/.test(line));

  if (headers.length !== 1) {
    return { ok: false, reason: `expected one canonical DROP-IN section, found ${headers.length}` };
  }

  const { line: header, index: start } = headers[0];
  const endOffset = lines
    .slice(start + 1)
    .findIndex((line) => /^===.*===$/.test(line.trim()));
  const end = endOffset === -1 ? lines.length : start + 1 + endOffset;
  const body = lines.slice(start + 1, end).map((line) => line.trim());
  const canonical = body
    .map((line) => line.match(/^(\$\d+(?:\.\d{2})?) for a single class, booked and paid at (https:\/\/\S+)$/))
    .filter((match): match is RegExpMatchArray => match !== null);

  if (canonical.length !== 1) {
    return { ok: false, reason: `expected one canonical drop-in booking line, found ${canonical.length}` };
  }

  const price = canonical[0][1];
  const bookingUrl = canonical[0][2];
  const headerPrice = header.match(/\(PAID, (\$\d+(?:\.\d{2})?)\)/)?.[1];
  if (headerPrice !== price) {
    return { ok: false, reason: "DROP-IN header and booking-line prices disagree" };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(bookingUrl);
  } catch {
    return { ok: false, reason: "drop-in booking URL is invalid" };
  }
  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.hash
  ) {
    return { ok: false, reason: "drop-in booking URL must be a plain HTTPS URL" };
  }

  const pricing = parsePricing(facts);
  const dropInTiers = pricing?.tiers.filter((tier) => tier.isDropIn) ?? [];
  if (dropInTiers.length !== 1) {
    return { ok: false, reason: `expected one drop-in pricing tier, found ${dropInTiers.length}` };
  }
  if (!/^\$\d+(?:\.\d{2})?$/.test(dropInTiers[0].firstOption)) {
    return { ok: false, reason: "drop-in pricing tier does not start with one exact price" };
  }
  if (dropInTiers[0].firstOption !== price) {
    return { ok: false, reason: "pricing tier and DROP-IN section prices disagree" };
  }

  return { ok: true, value: { price, bookingUrl } };
}
