import { test, expect } from "@playwright/test";

// READ-ONLY suite. Nothing here writes to Supabase, submits the
// forgot-password form (that would send a real recovery email), or touches
// any WhatsApp/Telegram/Meta route.

test("login page renders its fields", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText("JMT OS Login")).toBeVisible();
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Forgot password?" })).toBeVisible();
});

// The highest-value assertion in this repo: a broken auth gate on a gym
// management app leaks coach/student data.
for (const path of ["/", "/schedule", "/leave", "/wa-inbox", "/leads", "/earning"]) {
  test(`unauthenticated ${path} redirects to /login`, async ({ page }) => {
    const res = await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
    expect(res?.status()).toBe(200);
    // No dashboard chrome leaked into the response we actually got.
    await expect(page.getByRole("navigation")).toHaveCount(0);
  });
}

test("unknown route does not leak or 500 — it hits the auth gate", async ({ page }) => {
  const res = await page.goto("/definitely-not-a-route-9f2c");
  expect(res?.status()).toBeLessThan(500);
  await expect(page).toHaveURL(/\/login$/);
});

test("login form blocks empty and malformed submits client-side", async ({ page }) => {
  await page.goto("/login");
  const email = page.locator('input[type="email"]');

  // This test exercises native HTML constraint validation, not pointer
  // actionability. requestSubmit() follows the browser's submit algorithm but
  // avoids a flaky stability wait while Next dev is compiling in parallel.
  await page.locator("form").evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect(page).toHaveURL(/\/login$/);
  expect(await email.evaluate((el: HTMLInputElement) => el.validity.valueMissing)).toBe(true);

  await email.fill("not-an-email");
  await page.locator('input[type="password"]').fill("whatever");
  await page.locator("form").evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect(page).toHaveURL(/\/login$/);
  expect(await email.evaluate((el: HTMLInputElement) => el.validity.typeMismatch)).toBe(true);
});

test("password show/hide toggle works", async ({ page }) => {
  await page.goto("/login");
  const pw = page.locator('input[type="password"]');
  await pw.fill("secret");
  const show = page.getByRole("button", { name: "Show" });
  await expect(show).toBeVisible();
  // The control is visibly rendered but its absolutely-positioned wrapper can
  // keep moving during Next dev hydration. Exercise the actual click handler
  // without making this UI-state test depend on that layout-stability check.
  await show.click({ force: true });
  await expect(page.locator('input[type="text"][placeholder="Enter password"]')).toBeVisible();
  const hide = page.getByRole("button", { name: "Hide" });
  await expect(hide).toBeVisible();
  await hide.click({ force: true });
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

test("forgot-password renders (no submit — that would email a real user)", async ({ page }) => {
  await page.goto("/forgot-password");
  await expect(page.getByRole("heading", { name: "Reset password" })).toBeVisible();
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Send reset link" })).toBeVisible();
});

test("reset-password without a token reports an invalid link", async ({ page }) => {
  await page.goto("/reset-password");
  await expect(page.getByRole("heading", { name: "Set a new password" })).toBeVisible();
  // 2.5s grace window in the page before it gives up on the recovery token.
  await expect(page.getByText(/invalid or has expired/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("link", { name: "Request a new link" })).toBeVisible();
});
