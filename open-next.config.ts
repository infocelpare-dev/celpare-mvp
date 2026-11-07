/*
  OpenNext adapter config for Cloudflare Workers (D15, phase OPS).
  The incremental cache lives in R2, bound as NEXT_INC_CACHE_R2_BUCKET in
  wrangler.jsonc.
*/
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
});
