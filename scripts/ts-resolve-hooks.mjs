import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";

// `@/x` is the tsconfig path alias for `src/x`. Next resolves it; node does not,
// so any check script importing a module that uses the alias died on
// ERR_MODULE_NOT_FOUND. Added 12 Sep 2026 so pause-stale.ts (which imports
// "@/lib/wa/followup-dropin") can be driven by a test at all.
const SRC = new URL("../src/", import.meta.url);

export async function resolve(specifier, context, next) {
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
