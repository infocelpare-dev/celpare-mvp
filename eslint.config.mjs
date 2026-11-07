import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Cloudflare Workers build output (OpenNext) and wrangler's local state.
    // Generated, tens of megabytes of bundled JavaScript: linting it ran
    // ESLint out of memory after the first local Worker build.
    ".open-next/**",
    ".wrangler/**",
  ]),
]);

export default eslintConfig;
