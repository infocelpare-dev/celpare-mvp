/*
  OpenNext adapter config for Cloudflare Workers (D15, phase OPS).
  The incremental cache lives in R2, bound as NEXT_INC_CACHE_R2_BUCKET in
  wrangler.jsonc.
*/
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
  /*
    Workers free plan (2026-11-18): a request may use 10 ms of CPU, and loading
    the Next.js server in a fresh isolate takes more than that on its own, so
    even a page already in the cache failed with error 1102. With this on, a
    cached page (the prebuilt signed out profiles, Explore tabs, help, legal)
    is answered from the cache before the server is loaded. Must stay false if
    Partial Prerendering is ever turned on.
  */
  enableCacheInterception: true,
});
