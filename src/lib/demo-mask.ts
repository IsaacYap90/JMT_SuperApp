// Display-only PII mask for filmed demos. STRICTLY env-gated.
//
// When DEMO_MODE !== "1" every export is an EXACT identity passthrough — zero
// behaviour change — because this repo deploys from the working tree and the
// mask must never touch production. When DEMO_MODE === "1" the helpers return
// deterministic fakes so the same underlying record (keyed by a stable id, else
// by the real value) maps to the SAME fake everywhere it is rendered.
//
// These transform ALREADY-FETCHED data at the render/fetch boundary. No DB
// writes, no effect on ids/keys used for operations — only the displayed strings.

// Read BOTH the server-only flag and the NEXT_PUBLIC_ flag: this module is
// imported by client components too (WA inbox), and non-NEXT_PUBLIC_ env vars are
// `undefined` in the browser bundle — without the public flag the client mask
// would silently no-op and leak real PII on camera after hydration.
// HARD PRODUCTION LOCK (Isaac, 2026-07-30: "The fake demo should only stay
// local"). Even if DEMO_MODE=1 is ever set on the production project — by hand,
// by a copied env, by mistake — the mask stays OFF on jmtos.ionicx.ai. Both
// halves are needed: VERCEL_ENV is server-only, NEXT_PUBLIC_VERCEL_ENV is what
// survives into the browser bundle, and this module is imported by client
// components too. Vercel sets both automatically; locally both are undefined,
// so demo mode still works on this machine.
const IS_PRODUCTION =
  process.env.VERCEL_ENV === "production" ||
  process.env.NEXT_PUBLIC_VERCEL_ENV === "production";

export const DEMO_MODE =
  !IS_PRODUCTION &&
  (process.env.DEMO_MODE === "1" || process.env.NEXT_PUBLIC_DEMO_MODE === "1");

// ~40 realistic MY/SG full names. Index chosen deterministically from the seed.
const NAMES = [
  "Marcus Tan", "Rachel Wong", "Daniel Ong", "Grace Lim", "Nurul Aisyah",
  "Hafiz Rahman", "Siti Nadia", "Arjun Nair", "Priya Menon", "Ravi Kumar",
  "Wei Jie Lau", "Mei Ling Chua", "Kai Wen Goh", "Farah Ismail", "Aiman Zulkifli",
  "Zara Abdullah", "Joshua Lee", "Natalie Teo", "Bryan Koh", "Cheryl Ng",
  "Ryan Chong", "Amanda Sim", "Ivan Toh", "Vanessa Yeo", "Darren Foo",
  "Melissa Chan", "Aaron Tan", "Jocelyn Ho", "Ethan Low", "Serena Wee",
  "Muhammad Firdaus", "Aisha Karim", "Deepak Raj", "Kavitha Suresh", "Jason Ang",
  "Charmaine Loh", "Gabriel Seah", "Rebecca Tay", "Nicholas Chua", "Shu Hui Lim",
];

// FNV-1a — small, stable, non-negative.
function hashSeed(key: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic fake full name. Identity passthrough when DEMO_MODE is off. */
export function maskName(real: string | null | undefined, seed?: string): string {
  if (!DEMO_MODE) return real as string;
  const key = seed ?? real ?? "";
  return NAMES[hashSeed(key) % NAMES.length];
}

/** Deterministic fake SG mobile "+65 8XXX XXXX". Identity passthrough when off. */
export function maskPhone(real: string | null | undefined, seed?: string): string {
  if (!DEMO_MODE) return real as string;
  const key = seed ?? real ?? "";
  const h = hashSeed(key);
  // Singapore mobile: +65 8XXX XXXX / 9XXX XXXX (JMT is a Singapore gym).
  const first = 8 + (h % 2);
  const p1 = String((h >>> 3) % 1000).padStart(3, "0");
  const p2 = String((h >>> 13) % 10000).padStart(4, "0");
  return `+65 ${first}${p1} ${p2}`;
}

/** Fake firstname.lastname@example.com matching the masked name. Identity passthrough when off. */
export function maskEmail(real: string | null | undefined, seed?: string): string {
  if (!DEMO_MODE) return real as string;
  const key = seed ?? real ?? "";
  const name = NAMES[hashSeed(key) % NAMES.length];
  const parts = name.split(/\s+/);
  const first = parts[0] || "user";
  const last = parts[parts.length - 1] || "demo";
  return `${first}.${last}@example.com`.toLowerCase();
}

/**
 * Replace phone-number-like substrings in free text with deterministic fakes.
 * Names in free text can't be caught — accepted limitation. Identity passthrough when off.
 * Each digit run is keyed by itself so the same number maps to the same fake anywhere,
 * so this takes no seed — the digit run IS the key.
 */
export function scrubText(text: string | null | undefined): string {
  if (!DEMO_MODE) return text as string;
  if (!text) return text as string;
  let out = text;
  // MY / international mobile forms first, then any generic 8-12 digit run.
  out = out.replace(/(\+?\s?6?0?[-\s]?1[0-9][-\s]?\d{3,4}[-\s]?\d{4})/g, (m) => maskPhone(m, m.replace(/\s/g, "")));
  out = out.replace(/\d{8,12}/g, (m) => maskPhone(m, m));
  return out;
}

/**
 * Mask the PII fields of a users-table row (client/member). Staff ids/keys and
 * all non-PII columns are preserved. Seeded by the row id for cross-screen
 * consistency. Identity passthrough when off.
 */
export function maskUser<
  T extends {
    id?: string | null;
    full_name?: string | null;
    phone?: string | null;
    email?: string | null;
    emergency_contact_name?: string | null;
    emergency_contact_phone?: string | null;
  } | null | undefined
>(u: T, seed?: string): T {
  if (!DEMO_MODE || !u) return u;
  const s = seed ?? u.id ?? u.full_name ?? "";
  return {
    ...u,
    full_name: maskName(u.full_name, s),
    phone: u.phone != null ? maskPhone(u.phone, s) : u.phone,
    email: u.email != null ? maskEmail(u.email, s) : u.email,
    emergency_contact_name:
      u.emergency_contact_name != null ? maskName(u.emergency_contact_name, s + ":ec") : u.emergency_contact_name,
    emergency_contact_phone:
      u.emergency_contact_phone != null ? maskPhone(u.emergency_contact_phone, s + ":ec") : u.emergency_contact_phone,
  } as T;
}

/** Mask a PT session's member + package-guardian PII. Identity passthrough when off. */
export function maskPtSession<
  T extends {
    member?: { id?: string | null; full_name?: string | null; phone?: string | null; email?: string | null } | null;
    package?: { guardian_name?: string | null; guardian_phone?: string | null } | null;
  }
>(s: T): T {
  if (!DEMO_MODE || !s) return s;
  const out = { ...s } as T;
  if (s.member) out.member = maskUser(s.member) as T["member"];
  if (s.package) {
    const g = s.package.guardian_phone ?? s.package.guardian_name ?? undefined;
    out.package = {
      ...s.package,
      guardian_name: s.package.guardian_name != null ? maskName(s.package.guardian_name, g) : s.package.guardian_name,
      guardian_phone: s.package.guardian_phone != null ? maskPhone(s.package.guardian_phone, g) : s.package.guardian_phone,
    } as T["package"];
  }
  return out;
}

/** Mask a PT package's member + guardian PII. Identity passthrough when off. */
export function maskPtPackage<
  T extends {
    member?: { id?: string | null; full_name?: string | null; phone?: string | null; email?: string | null } | null;
    guardian_name?: string | null;
    guardian_phone?: string | null;
  }
>(p: T): T {
  if (!DEMO_MODE || !p) return p;
  const g = p.guardian_phone ?? p.guardian_name ?? undefined;
  return {
    ...p,
    member: p.member ? (maskUser(p.member) as T["member"]) : p.member,
    guardian_name: p.guardian_name != null ? maskName(p.guardian_name, g) : p.guardian_name,
    guardian_phone: p.guardian_phone != null ? maskPhone(p.guardian_phone, g) : p.guardian_phone,
  } as T;
}

/**
 * Mask Meta Lead-Ad form_fields. name/email/phone fields are seeded by the same
 * lead id so they match the lead's top-level masked values; other values are
 * phone-scrubbed. Identity passthrough when off.
 */
export function maskFormFields(
  fields: Record<string, string> | null | undefined,
  seed?: string
): Record<string, string> | null | undefined {
  if (!DEMO_MODE || !fields) return fields;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (!v) { out[k] = v; continue; }
    const key = k.toLowerCase();
    if (key.includes("email") || v.includes("@")) out[k] = maskEmail(v, seed);
    else if (/phone|mobile|contact|number|whatsapp|tel|\bhp\b/.test(key) || /\d{7,}/.test(v)) out[k] = maskPhone(v, seed);
    else if (key.includes("name")) out[k] = maskName(v, seed);
    else out[k] = scrubText(v);
  }
  return out;
}
