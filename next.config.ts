import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

/*
  Response headers on every route. None of these existed before the 2026-09-23 audit.

  - HSTS: once a browser has seen the site over https it never tries http again,
    so a network in the middle cannot downgrade a sign in. Ignored on localhost.
  - nosniff: a file uploaded as an image is never executed as a script because a
    browser guessed its type.
  - frame-ancestors 'self' (and X-Frame-Options for older browsers): no other site
    can frame Celpare to trick a click (clickjacking). Same origin stays allowed on
    purpose, because the 390px check loads the app in an iframe of itself.
  - object-src, base-uri, form-action: the three CSP directives that close real
    injection routes and cannot break a Next app. A full script CSP needs per request
    nonces through the proxy and is recorded as a follow up, not guessed at here.
  - Permissions-Policy: the microphone is for our own origin only (DM voice notes);
    camera, location and payment are off everywhere.
*/
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(self), geolocation=(), payment=(), usb=()",
  },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'",
  },
];

const nextConfig: NextConfig = {
  /* No "X-Powered-By: Next.js". It tells a scanner which exploits to try first. */
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
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
  sentryUrl: "https://de.sentry.io/",

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
