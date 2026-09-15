import * as Sentry from "@sentry/nextjs";

/*
  Next.js calls register() once per runtime as the server starts. This is what
  actually loads the Sentry config for the Node and edge runtimes: without it
  the config files are dead code that nothing imports.

  The client is not here. instrumentation-client.ts is loaded by Next itself.
*/
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

/*
  Errors thrown inside Server Components, server actions and middleware. Without
  this hook those are logged to the console and never reach Sentry, which would
  leave the entire admin dashboard and the whole of Ask Celpare unmonitored,
  since both are server rendered.
*/
export const onRequestError = Sentry.captureRequestError;
