/*
  Pure formatters, deliberately in their own module rather than beside a
  component. Anything exported from a "use client" file can only be called on
  the client, and these are needed on both sides: the profile header renders on
  the server, the tab strip on the client.
*/

/* 1.2K rather than 1200, per 10-community.md section 9. */
export function formatCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    const k = n / 1000;
    return `${k < 10 ? k.toFixed(1).replace(/\.0$/, "") : Math.round(k)}K`;
  }
  const m = n / 1_000_000;
  return `${m < 10 ? m.toFixed(1).replace(/\.0$/, "") : Math.round(m)}M`;
}

/*
  Bytes, for the storage panel.

  Binary units, because that is what a storage bucket's own size limit is
  expressed in: the avatars bucket caps at 2097152, which is 2 MiB and not
  2.1 MB. Reporting it as the latter beside a limit written as the former is how
  somebody ends up chasing a discrepancy that is not there.
*/
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";

  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let value = n;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  const shown = unit === 0 ? String(Math.round(value)) : value.toFixed(value < 10 ? 1 : 0);
  return `${shown.replace(/\.0$/, "")} ${units[unit]}`;
}

/*
  "9m ago". Shared, because three files had grown their own copy: the chat
  history panel, the profile view and now the feed.

  IT READS THE CLOCK, SO IT IS NOT STABLE ACROSS A SERVER AND A CLIENT RENDER.
  The server says 9m, the browser hydrates a second later and says 8m, and
  React throws a hydration mismatch and regenerates the subtree. That was a
  real defect on /ask, fixed in 4O.10. Anything rendering this on the server
  must put suppressHydrationWarning on the element that holds it, which is the
  case React documents the attribute for. Freezing the timestamp instead would
  stop a value that is supposed to move.
*/
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";

  const mins = Math.round((now - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;

  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    /* Pinned, because a date formatted on the server in one zone and in the
       browser in another is the same hydration bug in slower motion. */
    timeZone: "UTC",
  });
}

/* The host, so a link reads as a place rather than as a query string. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/*
  Make a typed link usable.

  PEOPLE DO NOT TYPE THE SCHEME. They type celpare.com, and an <input
  type="url"> refuses that with a native validation bubble that is easy to miss
  and impossible to style, so the form simply appears not to work. That is what
  "I cannot send a link" turned out to be: nothing was broken server side, the
  browser was silently refusing to submit.

  So the inputs are plain text with inputMode="url", and this puts the scheme
  back before validation. https, never http: guessing http for something typed
  by hand would downgrade a site that supports both.

  It deliberately does NOT try to fix a genuinely malformed value. Anything
  that still fails the pattern afterwards is refused by zod and by the CHECK
  constraint, with a message that names the problem.
*/
export function normaliseUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  /* Already has a scheme, of any kind. Left alone so an unsupported one is
     refused by validation rather than quietly turned into https. */
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return trimmed;

  /* A bare host, optionally with a path. Requires a dot, so a stray word does
     not become https://word. */
  if (/^[^\s/]+\.[^\s/]+/.test(trimmed)) return `https://${trimmed}`;

  return trimmed;
}
