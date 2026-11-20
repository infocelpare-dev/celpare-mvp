/*
  Sign out after 3 days away (founder, 2026-11-20, D272), the way large sites
  expire an idle session. Supabase's own inactivity timeout needs the Pro plan,
  so src/proxy.ts does it: every request with a session reads this cookie, and
  a session that has not reached Celpare for IDLE_LIMIT_MS is signed out.

  The cookie holds `<session id>.<last seen, ms>`. Tying it to the session id
  means a new login starts its own clock without a hook in every login path,
  and a stale value left over from an old session can never expire a new one.

  Not a security boundary on its own: someone holding the cookies could edit
  the time. It protects an unattended, logged in browser, which is the point.
  Pure, so it is tested without a request.
*/

/* Not cp_seen: that name is the feed's seen posts cookie. */
export const IDLE_COOKIE = "cp_active";

/* Three days with no request to Celpare. */
export const IDLE_LIMIT_MS = 3 * 24 * 60 * 60 * 1000;

/* Writing the cookie on every request is needless; once an hour is plenty for
   a three day limit, and it keeps responses cacheable for the rest. */
export const TOUCH_EVERY_MS = 60 * 60 * 1000;

/* Long enough to outlive the limit; the value, not the cookie age, decides. */
export const IDLE_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

export type IdleVerdict = "expired" | "touch" | "fresh";

export function idleVerdict(raw: string | undefined, sessionId: string, now: number): IdleVerdict {
  const dot = raw?.lastIndexOf(".") ?? -1;
  if (!raw || dot <= 0) return "touch";
  if (raw.slice(0, dot) !== sessionId) return "touch";
  const seen = Number(raw.slice(dot + 1));
  /* Unreadable, or in the future (a clock or an edit): start the clock now. */
  if (!Number.isFinite(seen) || seen > now) return "touch";
  const away = now - seen;
  if (away > IDLE_LIMIT_MS) return "expired";
  return away > TOUCH_EVERY_MS ? "touch" : "fresh";
}

export function idleValue(sessionId: string, now: number): string {
  return `${sessionId}.${now}`;
}
