import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  /* config options here */
};

/*
  Sentry's build step. It does three things worth knowing about:

  1. Uploads source maps, so a production stack trace names your function rather
     than reading as one line of minified output. This needs SENTRY_AUTH_TOKEN,
     which is a secret: it stays out of the repo and out of any NEXT_PUBLIC_
     variable, per hard rule 4. Without it the build still succeeds and the
     traces are just less readable.

  2. Routes events through our own origin at /monitoring, so an ad blocker does
     not silently swallow the error reports. The cost is that those requests hit
     our server. Worth it: an error monitor that a common extension can turn off
     is one you cannot trust the silence of.

  3. Strips the Sentry SDK's own debug logging from the production bundle.
*/
export default withSentryConfig(nextConfig, {
  org: "celpare",
  project: "javascript-nextjs",

  /* The Sentry org is in the EU region. Without this the CLI uploads to the US
     host and the maps never arrive. */
  sentryUrl: "https://sentry.io/",

  authToken: process.env.SENTRY_AUTH_TOKEN,

  /* Quiet locally, loud in CI, where the upload failing is something somebody
     needs to see. */
  silent: !process.env.CI,

  /* Pulls in the maps for files outside the immediate server bundle, which is
     what makes a trace through a shared lib readable. */
  widenClientFileUpload: true,

  /* See point 2. src/middleware.ts must not intercept this path, and its
     matcher excludes it. */
  tunnelRoute: "/monitoring",

  /* Was `disableLogger`, which the SDK now warns is going away. This is the
     replacement, and it is a no-op under Turbopack, which this project builds
     with. Kept because the webpack path is still what a production build uses
     when Turbopack is not in play. */
  webpack: { treeshake: { removeDebugLogging: true } },
});
