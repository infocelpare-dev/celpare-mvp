/*
  True when a request came from a page on this site. Browsers send
  Sec-Fetch-Site on every fetch and beacon; Origin is the fallback for the few
  that do not. A request with neither is refused.
*/
export function sameOrigin(headers: Headers): boolean {
  const site = headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === headers.get("host");
  } catch {
    return false;
  }
}
