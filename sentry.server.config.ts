import * as Sentry from "@sentry/nextjs";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

/*
  Sentry on the Node server.

  This is the runtime that matters most for Celpare: the AI gateway, every
  server action, every admin RPC call and every Supabase read happen here.

  Deliberately more careful about what leaves the process than the client is.
  Server events can carry request bodies, and this server handles sign in
  payloads, Ask Celpare questions and admin actions with reasons attached.
*/

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
const isDev = process.env.NODE_ENV === "development";

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,

    tracesSampleRate: isDev ? 1.0 : 0.1,

    /* Required to enable profiling at all: the default is 0. */
    profileSessionSampleRate: isDev ? 1.0 : 0.1,
    profileLifecycle: "trace",

    integrations: [nodeProfilingIntegration()],

    /*
      Aborted requests, which are not errors.

      "The destination stream closed early" is what Next throws when a client
      goes away mid render: the person navigated, refreshed, or closed the tab
      while an RSC response was still streaming. The stack contains no
      application frame, only Next's own runtime, and there is nothing to fix.
      Sentry's own Seer rated the first two occurrences "super_low"
      actionability.

      Narrow on purpose. This matches one message, not a pattern like /stream/,
      so a genuine streaming failure still reports. Muting a whole class to
      quieten one noisy member is how a monitor stops being worth reading.
    */
    ignoreErrors: ["The destination stream closed early."],

    /*
      Sentry's own ingest traffic, which tunnelRoute makes visible.

      The browser posts events to /monitoring on our origin, this server
      forwards them to Sentry, and that forward is an outgoing HTTP call the SDK
      then traces. The result was 204 spans against Sentry's own envelope
      endpoint at p95 1974ms, making Sentry itself the busiest thing the app
      appeared to do.

      Dropped here rather than only filtered out of the dashboard query, because
      it is quota spent on watching ourselves.
    */
    ignoreTransactions: [/\/api\/\d+\/envelope\//],

    /*
      No request bodies, no user identity harvested automatically.

      An Ask Celpare request body is somebody's question, and a sign in body is
      a password. Sentry filters keys on a denylist, but the safe default here
      is not to send the body at all: a stack trace and a URL are what actually
      debug a 500, and the body is the part that turns an error report into a
      data incident. The gateway attaches the few fields worth having, itself.
    */
    dataCollection: {
      userInfo: false,

      /* No HTTP bodies, in either direction. An Ask Celpare request body is
         somebody's question and a sign in body is a password. A stack trace and
         a URL are what debug a 500; the body is the part that turns an error
         report into a data incident. */
      httpBodies: [],
      cookies: false,

      /*
        OFF, and this is the setting worth pausing on.

        It defaults to true and captures the values of local variables in stack
        frames. src/app/actions/auth.ts has `password` in scope. An exception
        thrown anywhere near it would put a plaintext password in an error
        report, which is precisely what the brief's section 22 forbids.

        Sentry supports filtering by variable name, and the SDK's own docs warn
        that minifiers rename locals, so a deny list for "password" matches
        nothing once the thing is bundled. A filter that silently stops working
        in production is worse than no filter. Off is the honest setting.
      */
      stackFrameVariables: false,
    },

    /*
      Last gate before anything leaves the process.

      Belt and braces over dataCollection: if a future SDK default changes, or
      an integration attaches something new, these fields are stripped here
      regardless. Cheap, and the failure mode it prevents is the expensive kind.
    */
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        if (event.request.headers) {
          delete event.request.headers.cookie;
          delete event.request.headers.authorization;
          delete event.request.headers["x-celpare-client-ip"];
        }
      }
      return event;
    },
  });
}
