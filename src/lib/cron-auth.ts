import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";

// Vercel Cron attaches `Authorization: Bearer ${CRON_SECRET}` automatically
// when CRON_SECRET is set in the project's env vars.
//
// FAIL CLOSED: if CRON_SECRET is unset we deny (rather than skipping auth).
// Constant-time compare to avoid leaking the secret via response timing.
export function isAuthorizedCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const auth = req.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;

  const a = Buffer.from(auth);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
