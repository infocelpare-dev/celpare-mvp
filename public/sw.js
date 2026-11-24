/*
  Celpare's service worker. One job: when Cloudflare answers a page load with
  its own error page instead of Celpare, show a Celpare page with Try again.

  Why here and not on the server: on the Workers free plan a page that needs
  more than 10 ms of CPU is killed (Error 1102), and Cloudflare writes the reply
  itself, so no Celpare code runs. Cloudflare's custom error pages need a paid
  plan. The browser is the only place left that can step in.

  What it touches:
  - Page loads only (request.mode "navigate", GET). Scripts, images, data
    fetches, server actions and everything else go straight to the network:
    no respondWith, so the browser behaves exactly as if this file did not exist.
  - Never /api, /auth or /monitoring. An OAuth callback must not be replayed.
  - It caches nothing but the logo, for the offline page.

  How it knows the reply is Cloudflare's and not ours: every Celpare response
  carries X-Content-Type-Options (next.config.ts securityHeaders); Cloudflare's
  generated errors do not, and say "error code: NNNN" in the body. Measured live
  2026-11-24: 503, text/plain, "error code: 1102", no cf-error-type header.

  1102 (CPU) and 1101 come and go, so a failed load is retried twice, quietly,
  before anything is shown; most visitors never see the page. 1027 (the daily
  request limit) and 429 (our rate limit rule, D249) are not retried, since
  retrying only makes them worse.

  To remove: replace this file with one that calls self.registration.unregister()
  and deploy. Deleting it leaves the old one running in browsers that have it.
*/

const VERSION = "celpare-sw-1";
const LOGO = "/brand/celpare-mark-dark-64.png";
const SKIP = /^\/(api|auth|monitoring)(\/|$)/;
const RETRY_DELAYS_MS = [400, 1200];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.add(LOGO))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable().catch(() => undefined);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  /* The logo on the error page, from the cache when the network is gone. */
  if (url.origin === self.location.origin && url.pathname === LOGO) {
    event.respondWith(caches.match(LOGO).then((hit) => hit || fetch(req)));
    return;
  }
  if (req.mode !== "navigate" || req.method !== "GET") return;
  if (url.origin !== self.location.origin || SKIP.test(url.pathname)) return;
  event.respondWith(load(event));
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* The error code Cloudflare wrote, or null when the reply is Celpare's own. */
async function cloudflareError(res) {
  if (res.type === "opaqueredirect" || res.status < 429) return null;
  if (res.headers.has("x-content-type-options")) return null;
  const text = await res.clone().text().catch(() => "");
  const m = text.match(/error code:?\s*(\d{3,4})/i) || text.match(/Error\s+(1\d{3})/);
  if (m) return m[1];
  return res.status === 429 ? "429" : String(res.status);
}

async function load(event) {
  let res;
  let code = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const preload = attempt === 0 ? await event.preloadResponse : undefined;
      res = preload || (await fetch(event.request.clone()));
    } catch {
      /* No network at all. Offline is not something a retry here fixes. */
      return page("offline", null);
    }
    code = await cloudflareError(res);
    if (!code) return res;
    if (!retryable(code)) break;
    if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
  }
  return page(kindOf(code), res.headers.get("cf-ray"), res.status);
}

function retryable(code) {
  return code !== "1027" && code !== "1015" && code !== "429";
}

function kindOf(code) {
  if (code === "1027") return "limit";
  if (code === "1015" || code === "429") return "rate";
  return "busy";
}

const COPY = {
  busy: {
    title: "This page is taking a break",
    body: "Celpare could not load it just now. It usually works on the next try.",
  },
  limit: {
    title: "Celpare is very busy today",
    body: "We have more visitors than we can serve right now. Please try again in a little while.",
  },
  rate: {
    title: "Too many tries at once",
    body: "Wait a few seconds, then try again.",
  },
  offline: {
    title: "You are offline",
    body: "Check your connection, then try again.",
  },
};

function page(kind, ray, status) {
  const c = COPY[kind];
  /* A rate limit block lasts 10 seconds (D249), so Try again waits that long. */
  const wait = kind === "rate" ? 10 : 0;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${c.title} | Celpare</title>
<style>
  :root { --ink:#1C1C1C; --paper:#FFFFFF; --canvas:#FAFAF9; --muted:#5A5A5A; --faint:#8A8A8A; --line:#E7E5E4; --lime:#D1FE03; }
  @media (prefers-color-scheme: dark) {
    :root { --ink:#FAFAF9; --paper:#1C1C1C; --canvas:#141414; --muted:#A8A29E; --faint:#78716C; --line:#2E2E2E; }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; }
  body {
    min-height: 100dvh; display: grid; place-items: center; padding: 24px 16px;
    background: var(--canvas); color: var(--ink);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  main { width: 100%; max-width: 440px; text-align: center; }
  .mark { width: 48px; height: 48px; border-radius: 12px; display: block; margin: 0 auto 28px; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 999px; background: var(--lime); margin-right: 8px; vertical-align: middle; }
  .eyebrow { font-size: 13px; color: var(--muted); margin: 0 0 12px; }
  h1 { font-size: 26px; line-height: 1.2; font-weight: 500; letter-spacing: -0.02em; margin: 0; }
  p.body { margin: 12px 0 0; font-size: 15px; line-height: 1.6; color: var(--muted); }
  .actions { margin-top: 28px; display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
  .btn {
    min-height: 44px; padding: 0 22px; border-radius: 999px; font: inherit; font-size: 15px; font-weight: 500;
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    cursor: pointer; text-decoration: none; transition: opacity 150ms ease-out;
  }
  .primary { background: var(--ink); color: var(--paper); border: 1px solid var(--ink); }
  .primary:hover { opacity: 0.88; }
  .primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .secondary { background: transparent; color: var(--ink); border: 1px solid var(--line); }
  .secondary:hover { border-color: var(--ink); }
  .btn:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
  @media (prefers-color-scheme: dark) { .btn:focus-visible { outline-color: var(--lime); } }
  .spin { width: 16px; height: 16px; border: 2px solid currentColor; border-right-color: transparent; border-radius: 999px; display: none; animation: r 700ms linear infinite; }
  .loading .spin { display: inline-block; }
  @keyframes r { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
  .ref { margin-top: 24px; font-size: 12px; color: var(--faint); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
</style>
</head>
<body>
<main role="alert" aria-live="assertive">
  <img class="mark" src="${LOGO}" alt="Celpare" width="48" height="48">
  <p class="eyebrow"><span class="dot" aria-hidden="true"></span>Celpare</p>
  <h1>${c.title}</h1>
  <p class="body">${c.body}</p>
  <div class="actions">
    <button id="retry" class="btn primary" type="button"${wait ? " disabled" : ""}>
      <span class="spin" aria-hidden="true"></span><span id="label">${wait ? `Try again in ${wait}` : "Try again"}</span>
    </button>
    <a class="btn secondary" href="/">Go to home</a>
  </div>
  ${ray ? `<p class="ref">Reference ${String(ray).replace(/[^\w-]/g, "")}</p>` : ""}
</main>
<script>
  (function () {
    var btn = document.getElementById("retry");
    var label = document.getElementById("label");
    var left = ${wait};
    if (left > 0) {
      var t = setInterval(function () {
        left -= 1;
        if (left <= 0) { clearInterval(t); btn.disabled = false; label.textContent = "Try again"; }
        else { label.textContent = "Try again in " + left; }
      }, 1000);
    }
    btn.addEventListener("click", function () {
      btn.disabled = true;
      btn.classList.add("loading");
      label.textContent = "Loading";
      location.reload();
    });
  })();
</script>
</body>
</html>`;
  return new Response(html, {
    status: status && status >= 400 ? status : 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
