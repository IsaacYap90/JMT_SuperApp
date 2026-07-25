import { defineConfig, devices } from "@playwright/test";

// Port 3210 — several other dev servers run on this box (3000/3007/3030/3040/
// 3050/3060/3070/3100/...). reuseExistingServer is off so a stray listener can
// never make the suite silently test the wrong app.
const PORT = Number(process.env.E2E_PORT ?? 3210);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: "list",
  use: { baseURL, trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: baseURL + "/login",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
