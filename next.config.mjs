/** @type {import('next').NextConfig} */

import { execSync } from "node:child_process";

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
  allowedDevOrigins: ["*.trycloudflare.com"],
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_BUILD_SHA: buildSha,
    NEXT_PUBLIC_BUILD_TIME: buildTime,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
