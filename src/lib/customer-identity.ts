/**
 * Canonical customer identifiers shared by leads, trials and JAI.
 *
 * JMT is Singapore-first, so an unqualified eight-digit Singapore number is
 * promoted to E.164. Other countries must include `+` or the international
 * `00` prefix; guessing their country would create unsafe customer merges.
 * Invalid or ambiguous input returns null and must be reviewed, never linked.
 */

export type CanonicalCustomerIdentifiers = {
  phoneE164: string | null;
  emailNormalized: string | null;
};

const E164_RE = /^\+[1-9]\d{7,14}$/;
const SG_LOCAL_RE = /^[3689]\d{7}$/;

export function normalizeCustomerPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let raw = value.trim();
  if (!raw || raw.includes("@")) return null;

  raw = raw.replace(/^tel:/i, "").trim();
  const explicitlyInternational = raw.startsWith("+") || raw.startsWith("00");
  if (raw.startsWith("00")) raw = `+${raw.slice(2)}`;

  // Only formatting characters may be discarded. Letters often indicate an
  // extension or malformed form value; folding them into a number is unsafe.
  if (/[a-z]/i.test(raw)) return null;
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;

  let e164: string;
  if (explicitlyInternational) {
    e164 = `+${digits}`;
  } else if (SG_LOCAL_RE.test(digits)) {
    e164 = `+65${digits}`;
  } else if (/^65[3689]\d{7}$/.test(digits)) {
    e164 = `+${digits}`;
  } else {
    return null;
  }

  return E164_RE.test(e164) ? e164 : null;
}

export function normalizeCustomerEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!email || email.length > 254 || /\s/.test(email)) return null;

  const at = email.indexOf("@");
  if (at <= 0 || at !== email.lastIndexOf("@")) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!local || local.length > 64 || !domain || domain.length > 253) return null;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return null;
  if (domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) return null;
  if (!domain.includes(".")) return null;
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) return null;
  if (!/^[a-z0-9.-]+$/.test(domain)) return null;
  if (domain.split(".").some((part) => !part || part.startsWith("-") || part.endsWith("-"))) {
    return null;
  }
  return email;
}

export function canonicalCustomerIdentifiers(input: {
  phone?: unknown;
  email?: unknown;
}): CanonicalCustomerIdentifiers {
  return {
    phoneE164: normalizeCustomerPhone(input.phone),
    emailNormalized: normalizeCustomerEmail(input.email),
  };
}

