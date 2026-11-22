import { safeNext } from "./safe-next";

/*
  Back to what you were doing after log in or sign up (founder, 2026-11-22).

  A signed out visitor who taps Like, opens Messages or starts a submission is
  sent to log in or sign up. They used to land on /ask afterwards, so whatever
  they were in the middle of was lost. Now the page they came from rides along
  as `?next=` through every step: the sign in prompt or the guarded page, the
  form, the emailed code, /app (onboarding first for a new account), then back.

  Only a path on this site survives (safeNext decides that). The sign in pages
  themselves and the /app funnel are refused too: returning to them would loop
  or skip onboarding.
*/

/* Any fixed origin works: safeNext only compares where the path resolves. */
const ORIGIN = "https://celpare.com";

const NOT_A_DESTINATION = [
  "/app",
  "/welcome",
  "/login",
  "/signup",
  "/get-started",
  "/verify",
  "/forgot-password",
  "/reset-password",
  "/auth",
  "/api",
];

/* The page to go back to, or null when there is none worth returning to. */
export function returnPath(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 1000) return null;
  /* A refused path comes back as /app, which the list below turns into null. */
  const path = safeNext(raw, ORIGIN);
  const pathname = path.split(/[?#]/)[0];
  if (NOT_A_DESTINATION.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;
  return path;
}

/* `path` with `next` attached, or `path` alone when `next` is not usable. */
export function withNext(path: string, raw: unknown): string {
  const next = returnPath(raw);
  if (!next) return path;
  return `${path}${path.includes("?") ? "&" : "?"}next=${encodeURIComponent(next)}`;
}
