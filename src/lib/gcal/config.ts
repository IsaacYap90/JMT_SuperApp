/**
 * Server-side configuration check for the Google Calendar mirror.
 *
 * Returns ONLY non-secret information: the NAMES of env vars that are missing
 * or unusable. It never returns, logs, or partially echoes a value, so the
 * result is safe to hand to a client component.
 *
 * Callers use this to fail closed (redirect + explain) instead of throwing a
 * 500 out of an API route, which a browser can render as a file download.
 */

export const GCAL_ENV_VARS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "GCAL_TOKEN_ENCRYPTION_KEY",
] as const;

export interface GcalConfigStatus {
  /** True only when every required var is present AND usable. */
  configured: boolean;
  /** Env var names that are absent or blank. Names only — never values. */
  missing: string[];
  /** Env var names that are set but malformed. Names only — never values. */
  invalid: string[];
}

/**
 * Google only accepts an https redirect URI, with http allowed solely for
 * loopback (localhost / 127.0.0.1). A plain-http LAN or Tailscale host is
 * therefore never a valid OAuth callback — see docs/google-calendar-mirror.md.
 */
export function isUsableRedirectUri(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol === "https:") return true;
  if (url.protocol === "http:") {
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  }
  return false;
}

export function getGcalConfigStatus(): GcalConfigStatus {
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const name of GCAL_ENV_VARS) {
    const value = process.env[name];
    if (!value || value.trim() === "") missing.push(name);
  }

  // A 32-byte hex key is required by src/lib/gcal/crypto.ts; anything else
  // makes every token write throw at runtime.
  const key = process.env.GCAL_TOKEN_ENCRYPTION_KEY?.trim();
  if (key && !/^[0-9a-f]{64}$/i.test(key)) invalid.push("GCAL_TOKEN_ENCRYPTION_KEY");

  const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (redirectUri && !isUsableRedirectUri(redirectUri)) invalid.push("GOOGLE_REDIRECT_URI");

  return { configured: missing.length === 0 && invalid.length === 0, missing, invalid };
}

export function isGcalConfigured(): boolean {
  return getGcalConfigStatus().configured;
}
