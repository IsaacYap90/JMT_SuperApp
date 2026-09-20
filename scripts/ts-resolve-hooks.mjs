import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";

// `@/x` is the tsconfig path alias for `src/x`. Next resolves it; node does not,
// so any check script importing a module that uses the alias died on
// ERR_MODULE_NOT_FOUND. Added 12 Sep 2026 so pause-stale.ts (which imports
// "@/lib/wa/followup-dropin") can be driven by a test at all.
const SRC = new URL("../src/", import.meta.url);

// Next's package exports do not expose a bare `next/server` to plain node ESM
// (webpack resolves it during a build). Point it at the real file so a check
// script can import an App Router route handler and actually call it.
// Added 20 Sep 2026 for scripts/gcal-config-check.mjs.
const BARE_SUBPATH_FIX = {
  "next/server": "next/server.js",
  "next/headers": "next/headers.js",
};

export async function resolve(specifier, context, next) {
  if (BARE_SUBPATH_FIX[specifier]) {
    return next(BARE_SUBPATH_FIX[specifier], context);
  }
  if (specifier.startsWith("@/")) {
    const base = new URL(specifier.slice(2), SRC);
    for (const candidate of [base.pathname, base.pathname + ".ts", base.pathname + ".tsx"]) {
      if (existsSync(candidate)) return next(pathToFileURL(candidate).href, context);
    }
  }
  if (/^\.{1,2}\//.test(specifier) && !/\.[a-z]+$/i.test(specifier)) {
    try { return await next(specifier + ".ts", context); } catch {}
  }
  return next(specifier, context);
}
