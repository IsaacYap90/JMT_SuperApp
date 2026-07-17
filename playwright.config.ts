import { defineConfig, devices } from "@playwright/test";

// Smoke suite runs against a REAL production build served locally:
//   npm run build   (green step 1, done before this)
//   next start -p 3457   (managed by webServer below)
// READ-ONLY against prod: no test writes/mutations. See tests/smoke.spec.ts.
const PORT = 3457;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "off",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `${BASE_URL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
