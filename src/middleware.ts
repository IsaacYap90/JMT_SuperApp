import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Exclude Next internals, common static assets, AND PWA files
    // (manifest, service worker, offline fallback, /.well-known/ for the Play
    // Store TWA assetlinks) so they bypass auth
    // and can be fetched anonymously on cold start from the home-screen icon.
    "/((?!_next/static|_next/image|favicon.ico|\\.well-known/|manifest\\.webmanifest|sw\\.js|offline\\.html|icon-.*\\.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
