/*
  Telling crawlers from people, by the browser string. Pure: no imports, no
  env, no Next, so the proxy, the routes and the tests share one rule.

  Crawlers, previews and headless browsers. Most crawlers never run the page's
  JavaScript, so they never send a beacon at all; this catches the ones that
  do, plus link unfurlers that fetch with a script engine. An empty browser
  string is a script, not a person.
*/
const BOT =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora link preview|whatsapp|telegram|discord|skype|headless|phantom|puppeteer|playwright|selenium|lighthouse|pagespeed|gtmetrix|pingdom|uptime|statuscake|curl|wget|python-requests|httpclient|axios|node-fetch|go-http-client|okhttp|java\//i;

export function isBot(userAgent: string | null | undefined): boolean {
  if (!userAgent || userAgent.trim().length < 10) return true;
  return BOT.test(userAgent);
}

/*
  Compare and search addresses with a query are an endless set: every pair of
  tools, every query. Each one is a render on demand, and on the Workers free
  plan (10 ms CPU, 100k requests a day) a crawler walking them took the site's
  budget and wrote 1.1 million compare_events rows in 10 days (2026-11-20).
  robots.txt already asks crawlers to skip "/*?"; this is for the ones that do
  not ask. A crawler gets the plain page, which is prebuilt and cached.

  _rsc is Next's own marker on in app navigations and is not a query a person
  typed, so an address carrying only it is left alone.
*/
const QUERY_PAGES = new Set(["/compare", "/search"]);

export function botQueryRedirect(url: URL, userAgent: string | null | undefined): URL | null {
  if (!QUERY_PAGES.has(url.pathname)) return null;
  let hasQuery = false;
  for (const key of url.searchParams.keys()) {
    if (key !== "_rsc") {
      hasQuery = true;
      break;
    }
  }
  if (!hasQuery || !isBot(userAgent)) return null;
  const plain = new URL(url.toString());
  plain.search = "";
  plain.hash = "";
  return plain;
}
