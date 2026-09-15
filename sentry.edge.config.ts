import * as Sentry from "@sentry/nextjs";

/*
  Sentry in the edge runtime, which for Celpare means one thing: src/middleware.ts,
  the session refresh that runs on every request.

  No profiling integration here. @sentry/profiling-node is a native module and
  the edge runtime cannot load it, so importing it would break every request
  rather than add a profile.
*/

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
const isDev = process.env.NODE_ENV === "development";

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,

    /*
      Lower than the other two runtimes on purpose. Middleware runs on every
      single request including static asset misses, so sampling it at the server
      rate would make the trace quota mostly middleware and mostly identical.
    */
    tracesSampleRate: isDev ? 1.0 : 0.02,

    dataCollection: {
      userInfo: false,
      httpBodies: [],
      cookies: false,
      /* Same reasoning as the server config: a local variable in a stack frame
         can be a credential, and name based filtering does not survive
         minification. */
      stackFrameVariables: false,
    },

    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        if (event.request.headers) {
          delete event.request.headers.cookie;
          delete event.request.headers.authorization;
        }
      }
      return event;
    },
  });
}
