/*
  Lets Node's own test runner load the algorithm modules as they are written for
  Next: TypeScript with extensionless relative imports. Node 24 strips the types
  itself; this hook only adds the ".ts" a bare "./math" needs. No test framework,
  no build step, no new dependency.

  Plain string checks rather than a regex: a regex inside this template string
  loses its backslashes (rule 16), and "./experiments" then looked like it
  already had an extension.
*/
import { register } from "node:module";

const hook = `
  const EXTS = [".ts", ".mts", ".js", ".mjs", ".cjs", ".json"];
  export async function resolve(specifier, context, next) {
    const relative = specifier.startsWith("./") || specifier.startsWith("../");
    if (relative && !EXTS.some((e) => specifier.endsWith(e))) {
      try { return await next(specifier + ".ts", context); } catch {}
    }
    return next(specifier, context);
  }
`;

register("data:text/javascript," + encodeURIComponent(hook), import.meta.url);
