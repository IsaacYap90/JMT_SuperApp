/** @type {import('next').NextConfig} */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Build stamp — captured at build time. Vercel CLI deploys from the working tree
// and does NOT inject VERCEL_GIT_COMMIT_SHA reliably, so fall back to git.
const buildSha = (() => {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "dev";
  }
})();
const buildTime = new Date().toISOString().slice(0, 10);
const buildNumber = (() => {
  try {
    return execSync("git rev-list --count HEAD").toString().trim();
  } catch {
    return "0";
  }
})();
const pkgVersion = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version;
const buildVersion = `v${pkgVersion}.${buildNumber}`;

// Standard security headers (security audit 2026-07).
// TODO: add CSP (report-only first) — needs per-site asset-origin testing.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig = {
  // Dev only, ignored by `next build`. Isaac reviews previews over BOTH a
  // cloudflare tunnel and the tailnet; without the host here Next 15 blocks the
  // server actions the dashboard runs on and returns EMPTY data with no error.
  allowedDevOrigins: [
    "*.trycloudflare.com",
    "homepc.bumblebee-burbot.ts.net",
    "localhost",
    "127.0.0.1",
  ],
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_BUILD_SHA: buildSha,
    NEXT_PUBLIC_BUILD_TIME: buildTime,
    NEXT_PUBLIC_BUILD_VERSION: buildVersion,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
