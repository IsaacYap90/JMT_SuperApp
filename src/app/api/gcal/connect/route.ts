/**
 * GET /api/gcal/connect — Initiates Google OAuth flow for the logged-in coach.
 * Generates a CSRF state token, stores it in a cookie, and redirects to Google.
 *
 * Fails CLOSED: if Google OAuth is not configured, or anything else throws,
 * this route redirects back to /profile with a readable reason. It must never
 * return a raw 500 body — Safari renders one as a file download prompt.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildAuthUrl } from "@/lib/gcal/google-calendar";
import { getGcalConfigStatus } from "@/lib/gcal/config";
import { randomBytes, createHmac } from "node:crypto";
import { isAdmin } from "@/lib/types/database";

export const dynamic = "force-dynamic";

function hmacSign(payload: string): string {
  const secret = process.env.GCAL_TOKEN_ENCRYPTION_KEY;
  if (!secret) throw new Error("GCAL_TOKEN_ENCRYPTION_KEY not set");
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function profileUrl(req: NextRequest): string {
  const baseUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    `${req.nextUrl.protocol}//${req.nextUrl.host}`
  ).replace(/\/$/, "");
  return `${baseUrl}/profile`;
}

export async function GET(req: NextRequest) {
  const profile = profileUrl(req);

  try {
    // Fail closed before touching anything else: without Google credentials
    // there is no URL to send the browser to.
    if (!getGcalConfigStatus().configured) {
      return NextResponse.redirect(`${profile}?gcal_error=not_configured`);
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.redirect(`${profile}?gcal_error=unauthorized`);
    }

    // Verify user is a coach or admin
    const { data: userProfile } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!userProfile || (!["coach"].includes(userProfile.role) && !isAdmin(userProfile.role))) {
      return NextResponse.redirect(`${profile}?gcal_error=forbidden`);
    }

    // State = nonce:userId:hmac — CSRF protection
    const nonce = randomBytes(16).toString("hex");
    const payload = `${nonce}:${user.id}`;
    const sig = hmacSign(payload);
    const state = `${payload}:${sig}`;

    const authUrl = buildAuthUrl(state);

    const res = NextResponse.redirect(authUrl);
    // Store full state in httpOnly cookie for verification in callback
    res.cookies.set("gcal_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 minutes
      path: "/",
    });
    return res;
  } catch (err) {
    console.error("Google Calendar connect error:", err);
    return NextResponse.redirect(`${profile}?gcal_error=connect_failed`);
  }
}
