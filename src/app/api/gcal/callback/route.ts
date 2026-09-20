/**
 * GET /api/gcal/callback — Google OAuth callback.
 * Validates CSRF state, exchanges code for tokens, encrypts and stores them,
 * creates the app-owned "JMT Schedule" secondary calendar.
 *
 * Scope: calendar.app.created — can only see/modify calendars+events THIS app
 * created. Cannot list or search user's existing calendars.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createHmac } from "node:crypto";
import {
  exchangeCode,
  emailFromIdToken,
  createSecondaryCalendar,
} from "@/lib/gcal/google-calendar";
import { createConnection, setCalendarId, getExistingCalendarId } from "@/lib/gcal/connection";

export const dynamic = "force-dynamic";

const CALENDAR_NAME = "JMT Schedule";

function hmacVerify(payload: string, sig: string): boolean {
  const secret = process.env.GCAL_TOKEN_ENCRYPTION_KEY;
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return diff === 0;
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const stateParam = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  const baseUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    `${req.nextUrl.protocol}//${req.nextUrl.host}`
  ).replace(/\/$/, "");
  const profileUrl = `${baseUrl}/profile`;

  if (error) {
    return NextResponse.redirect(`${profileUrl}?gcal_error=${encodeURIComponent(error)}`);
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(`${profileUrl}?gcal_error=missing_params`);
  }

  // Verify CSRF state matches cookie
  const cookieState = req.cookies.get("gcal_oauth_state")?.value;
  if (!cookieState || cookieState !== stateParam) {
    return NextResponse.redirect(`${profileUrl}?gcal_error=csrf_mismatch`);
  }

  // Parse and verify HMAC
  const parts = stateParam.split(":");
  if (parts.length !== 3) {
    return NextResponse.redirect(`${profileUrl}?gcal_error=invalid_state`);
  }
  const [nonce, userId, sig] = parts;
  const payload = `${nonce}:${userId}`;
  if (!hmacVerify(payload, sig)) {
    return NextResponse.redirect(`${profileUrl}?gcal_error=state_tampered`);
  }

  // Verify the logged-in user matches the state userId
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== userId) {
    return NextResponse.redirect(`${profileUrl}?gcal_error=user_mismatch`);
  }

  try {
    // Exchange authorization code for tokens
    const tokens = await exchangeCode(code);

    if (!tokens.refresh_token) {
      return NextResponse.redirect(`${profileUrl}?gcal_error=no_refresh_token`);
    }

    const googleEmail = tokens.id_token ? emailFromIdToken(tokens.id_token) : null;

    // On reconnect, preserve the app-owned calendar ID from the previous
    // connection row (if any). The calendar.app.created scope only allows
    // access to calendars THIS app created, so we cannot search/list the
    // user's calendars — we must remember what we created.
    const existingCalId = await getExistingCalendarId(user.id);

    // Store the connection (tokens encrypted at rest)
    const connectionId = await createConnection({
      userId: user.id,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
      googleEmail,
      googleCalendarId: existingCalId,
    });

    // Create the secondary calendar only if we don't have one stored
    if (!existingCalId) {
      try {
        const calId = await createSecondaryCalendar(tokens.access_token, CALENDAR_NAME);
        await setCalendarId(connectionId, calId);
      } catch (calErr) {
        console.error("Failed to create Google Calendar:", calErr);
        // Connection is saved — calendar creation can happen on first sync
      }
    }

    // Clear the CSRF cookie and redirect to profile with success
    const response = NextResponse.redirect(`${profileUrl}?gcal_connected=1`);
    response.cookies.delete("gcal_oauth_state");
    return response;
  } catch (err) {
    console.error("Google Calendar OAuth callback error:", err);
    return NextResponse.redirect(`${profileUrl}?gcal_error=exchange_failed`);
  }
}
