import { test, expect } from "@playwright/test";

// JMT smoke suite — SAFETY NET before the Next 14 -> 15 upgrade.
//
// READ-ONLY against the live prod Supabase: every check is a GET/render only,
// nothing here logs in, writes, or mutates. The high-value target is the
// unauthenticated middleware/session path (src/lib/supabase/middleware.ts +
// server.ts) that Next 15's async-request-API change (cookies()/params/
// searchParams becoming async) will touch. If that regresses, protected routes
// stop redirecting or the async-API server pages 500 — both caught below.
//
// Deep authenticated flows (leave approval, PT booking, PDF contract render)
// need a real Supabase session/test user and are DEFERRED — see the note at the
// bottom of this file.

// Routes the middleware must protect: unauthenticated -> 307 redirect to /login.
const PROTECTED_ROUTES = ["/", "/schedule", "/pt", "/leave", "/earning", "/profile"];

test.describe("app boots", () => {
  test("login page renders with no uncaught JS error", async ({ page }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const t = msg.text();
      // Ignore resource-load noise (favicon/manifest/icons) — not a JS fault.
      if (/Failed to load resource|favicon|manifest|icon-|sw\.js/i.test(t)) return;
      consoleErrors.push(t);
    });

    const resp = await page.goto("/login", { waitUntil: "networkidle" });
    expect(resp, "response for /login").toBeTruthy();
    expect(resp!.status()).toBeLessThan(400);

    // Login form actually rendered (email + password inputs).
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();

    expect(pageErrors, "uncaught JS exceptions").toEqual([]);
    expect(consoleErrors, "console errors").toEqual([]);
  });
});

test.describe("negative-auth / middleware (Next 15 regression guard)", () => {
  // The key upgrade guard: the session middleware reads cookies() (async in
  // Next 15) and must still redirect unauthenticated users to /login.
  for (const route of PROTECTED_ROUTES) {
    test(`unauthenticated ${route} redirects to /login`, async ({ request }) => {
      const resp = await request.get(route, { maxRedirects: 0 });
      expect(resp.status(), `status for ${route}`).toBe(307);
      const location = resp.headers()["location"] || "";
      expect(location, `redirect target for ${route}`).toContain("/login");
    });
  }

  test("authenticated-only route never 500s (renders redirect, not crash)", async ({ request }) => {
    // /schedule uses searchParams (an async request API in Next 15). Even though
    // middleware redirects it unauth, a broken async-API path would surface as a
    // 500 here. Assert it is a clean redirect, not a server error.
    const resp = await request.get("/schedule?date=2026-07-01", { maxRedirects: 0 });
    expect(resp.status()).toBeLessThan(500);
    expect(resp.status()).toBe(307);
  });
});

test.describe("public async-API render smokes (searchParams / server pages)", () => {
  test("book/confirmation renders with searchParams (no 500, no JS error)", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));

    const resp = await page.goto(
      "/book/confirmation?name=SmokeTest&date=2026-08-01&time=18:00&class=Adult",
      { waitUntil: "networkidle" }
    );
    expect(resp!.status()).toBe(200);
    await expect(page.getByText(/Booking Confirmed/i)).toBeVisible();
    // searchParams were consumed by the server component and rendered through.
    await expect(page.getByText(/SmokeTest/)).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test("privacy page (public static) renders 200", async ({ request }) => {
    const resp = await request.get("/privacy");
    expect(resp.status()).toBe(200);
    expect(await resp.text()).toContain("Privacy Policy");
  });

  test("public trial booking page (server component, read-only DB) does not 500", async ({ request }) => {
    // /book/adult is public and reads trial_settings/classes (READ only). Confirms
    // the async server-component data path renders without crashing.
    const resp = await request.get("/book/adult");
    expect(resp.status(), "book/adult status").toBeLessThan(500);
  });
});

test.describe("unauth-accessible endpoints (read-only)", () => {
  test("calendar ICS feed rejects missing token with 401", async ({ request }) => {
    const resp = await request.get("/api/calendar");
    expect(resp.status()).toBe(401);
  });

  test("calendar ICS feed returns 404 for an unknown token (no data leak)", async ({ request }) => {
    // Read-only lookup by an unguessable token that matches no row.
    const resp = await request.get("/api/calendar?token=smoke-nonexistent-token-000");
    expect(resp.status()).toBe(404);
  });
});

// -----------------------------------------------------------------------------
// DEFERRED — need a READ-ONLY test-auth harness (real Supabase session/test user):
//   - coach dashboard render (post-login home)
//   - leave approval / PT booking flows
//   - PDF contract render (/pt/log/[id], @react-pdf/renderer)
//   - the authenticated /schedule and /pt/client/[id] param pages
// Not written as fake/happy-path stubs on purpose — they require a seeded test
// session and would either be brittle or risk touching prod data. Add a minimal
// Supabase test-user login fixture (storageState) to unlock these post-upgrade.
// -----------------------------------------------------------------------------
