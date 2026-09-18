import * as Sentry from "@sentry/nextjs";

/*
  Sentry in the browser.

  D6 said Sentry from Phase 1 and it was never actually wired: no package, no
  config, no DSN. This is that decision finally being carried out.

  The DSN is public by design. It identifies the project to write to and grants
  nothing else, which is why it is a NEXT_PUBLIC_ variable and why that does not
  violate hard rule 4. The auth token, which can read your data, is server side
  only and never appears in a client bundle.

  Everything here is off when the DSN is absent, so a checkout with no Sentry
  configured runs exactly as it did before rather than throwing at import time.
*/

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const isDev = process.env.NODE_ENV === "development";

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,

    /*
      Everything in dev, a tenth in production. Celpare has no traffic yet, so
      this costs nothing today and is the number to revisit once it does. Sampling
      is a quota decision, not a correctness one: the traces you drop are gone.
    */
    tracesSampleRate: isDev ? 1.0 : 0.1,

    /*
      Profiling. profileSessionSampleRate gates it and defaults to 0, so leaving
      it out means profiling silently never runs. "trace" ties a profile to a
      sampled trace rather than running continuously, which is the cheaper of
      the two lifecycles and the one that answers "why was this request slow".
    */
    profileSessionSampleRate: isDev ? 0 : 0.1,
    profileLifecycle: "trace",

    /*
      Replay and profiling are the two heavy pieces of the browser SDK. Replay
      records DOM mutations continuously and is the single largest addition to
      the client bundle; profiling adds its own work on top. Running both at 1.0
      locally made every page load slow for no return, because a replay of
      yourself building the page answers nothing.

      Production only now. Errors and tracing are untouched, so a local crash
      still reaches Sentry exactly as it did.
    */
    integrations: isDev ? [] : [
      /*
        Session Replay, with every default privacy control left ON.

        Celpare pages carry email addresses, private conversations with Ask
        Celpare, and the admin dashboard, which renders other people's account
        data. maskAllText and maskAllInputs are the difference between a replay
        that shows how somebody got stuck and a replay that is a copy of their
        personal data sitting in a third party. Unmask specific elements
        deliberately later if a particular flow needs it; never unmask globally.
      */
      Sentry.replayIntegration({
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
      }),
      Sentry.browserProfilingIntegration(),
    ],

    /*
      A tenth of production sessions, and always every session that hit an
      error. Zero in development, where the integration is not loaded at all.

      The error rate is the one that matters: a replay is worth having precisely
      when something went wrong.
    */
    replaysSessionSampleRate: isDev ? 0 : 0.1,
    replaysOnErrorSampleRate: 1.0,

    /*
      Do not send the browser's idea of who the user is. Sentry would otherwise
      attach IP and similar by default. The server attaches the Celpare user id
      where it is actually useful, which is deliberate rather than automatic.
    */
    dataCollection: { userInfo: false },

    /* Noise that is not ours and cannot be acted on. A failed fetch to a browser
       extension URL is not a Celpare bug. */
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      /^chrome-extension:\/\//,
      /^moz-extension:\/\//,
    ],
  });
}

/* Instruments App Router navigations so a slow page transition shows up as a
   trace rather than as nothing. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
