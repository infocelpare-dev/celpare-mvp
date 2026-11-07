/*
  Where to go after sign in. Only a path on this site is accepted.

  `next` comes from the query string or a request body, so anybody can write it.
  Joined straight onto the origin, `next=@evil.com` became
  `https://celpare@evil.com` and `next=.evil.com` became
  `https://celpare.evil.com`, both a different host, reached from a real Celpare
  sign in. Resolving against our own origin and comparing the result is the
  check that holds, because it asks the URL parser the same question the
  browser will.
*/
export function safeNext(raw: string | null | undefined, origin: string): string {
  const fallback = "/app";
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return fallback;
  }
  try {
    const resolved = new URL(raw, origin);
    if (resolved.origin !== origin) return fallback;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}
