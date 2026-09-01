// Resolver hook: extensionless relative imports -> .ts (Next resolves these; node does not).
import { register } from "node:module";
import { pathToFileURL } from "node:url";
if (!process.env.__TS_RESOLVE_REGISTERED) {
  process.env.__TS_RESOLVE_REGISTERED = "1";
  register(pathToFileURL(new URL("./ts-resolve-hooks.mjs", import.meta.url).pathname));
}
