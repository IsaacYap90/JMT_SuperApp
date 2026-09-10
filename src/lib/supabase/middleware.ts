import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// request.nextUrl carries the address the SERVER was reached on. Behind a proxy
// — a tailscale serve or a cloudflare tunnel in front of `next dev` — that is
// the internal one, so cloning it sent Isaac a 307 to https://localhost:3013 and
// his laptop, not the box, tried to answer it (10 Sep 2026). The forwarded
// headers carry the address the BROWSER actually used, so prefer them.
// No-op on Vercel, which sets x-forwarded-host to the real host already.
function externalUrl(request: NextRequest, pathname: string): URL {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  // Take whichever header actually carries a port, because the two proxies
  // differ: tailscale serve puts the browser's host:3013 in `host` and a bare
  // hostname in `x-forwarded-host`, while a cloudflare tunnel is on 443 and
  // carries no port at all. Preferring one blindly broke the other.
  const fwd = request.headers.get("x-forwarded-host");
  const raw = request.headers.get("host");
  const host = fwd?.includes(":") ? fwd : raw?.includes(":") ? raw : fwd || raw;
  if (host) {
    if (host.includes(":")) {
      url.host = host;
    } else {
      url.hostname = host;
      url.port = "";
    }
  }
  const proto = request.headers.get("x-forwarded-proto");
  if (proto) url.protocol = `${proto.split(",")[0].trim()}:`;
  return url;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/forgot-password") &&
    !request.nextUrl.pathname.startsWith("/reset-password") &&
    !request.nextUrl.pathname.startsWith("/book") &&
    !request.nextUrl.pathname.startsWith("/privacy") &&
    !request.nextUrl.pathname.startsWith("/api/calendar") &&
    !request.nextUrl.pathname.startsWith("/api/cron") &&
    !request.nextUrl.pathname.startsWith("/api/webhooks") &&
    !request.nextUrl.pathname.startsWith("/api/telegram") &&
    !request.nextUrl.pathname.startsWith("/api/meta") &&
    !request.nextUrl.pathname.startsWith("/api/whatsapp")
  ) {
    return NextResponse.redirect(externalUrl(request, "/login"));
  }

  if (user && request.nextUrl.pathname.startsWith("/login")) {
    return NextResponse.redirect(externalUrl(request, "/"));
  }

  return supabaseResponse;
}
