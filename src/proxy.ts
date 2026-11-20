import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  RECOVERY_COOKIE,
  SECOND_FACTOR_COOKIE,
  hasRecovery,
  hasSecondFactor,
  needsSecondFactor,
  secondFactorEnabled,
  sessionClaims,
} from "@/lib/auth/second-factor";
import { IDLE_COOKIE, IDLE_COOKIE_MAX_AGE, idleValue, idleVerdict } from "@/lib/auth/idle";
import { cleanRef, REF_COOKIE, REF_MAX_AGE } from "@/lib/onboarding/options";
import { EDGE_HEADER, TRUSTED_HEADER, edgeVerdict } from "@/lib/edge/origin";
import { isExploreTab } from "@/lib/explore/types";
import { botQueryRedirect } from "@/lib/edge/bots";

/*
  Refreshes the auth session on every request and writes the rotated cookies
  back. Without this, Server Components see an expired token and the user gets
  silently logged out.

  If Supabase is not configured yet, pass through rather than throwing, so the
  marketing pages still render.
*/
export async function proxy(request: NextRequest) {
  /* www.celpare.com is routed to the Worker only to send it to the apex, with
     path and query kept (wrangler.jsonc). Permanent, so search engines merge
     the two. */
  if (request.nextUrl.hostname === "www.celpare.com") {
    const apex = request.nextUrl.clone();
    apex.hostname = "celpare.com";
    apex.protocol = "https:";
    apex.port = "";
    return NextResponse.redirect(apex, 301);
  }

  /*
    Origin authentication first (D254). On Vercel production a request that did
    not come through Cloudflare is refused before any work is done. Whatever a
    client sent as the trusted mark is removed, and the mark is set only here,
    so lib/edge/origin.ts clientIpFrom can believe cf-connecting-ip when it is
    present. The secret itself is removed too, so no route can log it.
  */
  const verdict = edgeVerdict(request.headers.get(EDGE_HEADER));
  if (verdict === "reject") {
    return new NextResponse("Forbidden", {
      status: 403,
      headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" },
    });
  }
  request.headers.delete(EDGE_HEADER);
  request.headers.delete(TRUSTED_HEADER);
  request.headers.set(TRUSTED_HEADER, "1");

  /*
    A visitor with no session cookie has no session to refresh, so the Supabase
    client is not even built (usage audit, 2026-11-18). Their tool and model
    profiles are served from the cached signed out render instead of a fresh
    one: same page, same address bar, see app/anon/tools/[slug]/page.tsx.
  */
  if (!request.cookies.getAll().some((c) => SESSION_COOKIE.test(c.name))) {
    /* A crawler asking for a compare or search combination gets the plain,
       prebuilt page instead of a render on demand (lib/edge/bots.ts). */
    const plain = botQueryRedirect(request.nextUrl, request.headers.get("user-agent"));
    if (plain) return NextResponse.redirect(plain, 301);
    if (PROFILE.test(request.nextUrl.pathname)) {
      const cached = request.nextUrl.clone();
      cached.pathname = `/anon${request.nextUrl.pathname}`;
      return rememberRef(request, NextResponse.rewrite(cached, { request }));
    }
    if (PLAIN_CACHED.has(request.nextUrl.pathname) && onlyNextParams(request.nextUrl)) {
      const cached = request.nextUrl.clone();
      cached.pathname = `/anon${request.nextUrl.pathname}`;
      return rememberRef(request, NextResponse.rewrite(cached, { request }));
    }
    const tab = exploreTab(request.nextUrl);
    if (tab) {
      const cached = request.nextUrl.clone();
      cached.pathname = `/anon/explore/${tab}`;
      return rememberRef(request, NextResponse.rewrite(cached, { request }));
    }
    return rememberRef(request, NextResponse.next({ request }));
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Must be getUser, not getSession. getUser revalidates the token with the
  // auth server; getSession trusts whatever is in the cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  /*
    Password then code (D188). An email based session without the code step's
    mark is signed out: a password only session minted straight from the public
    API, or one from before the code step existed. getSession is safe to read
    here because getUser just validated the same token. Google is exempt.
  */
  let signedOut = false;
  const claims = user
    ? sessionClaims((await supabase.auth.getSession()).data.session?.access_token)
    : null;

  if (user && secondFactorEnabled()) {
    /* A reset link's session may reach the new password form, nothing else (D193). */
    const onResetForm =
      claims !== null &&
      request.nextUrl.pathname.startsWith("/reset-password") &&
      (await hasRecovery(request.cookies.get(RECOVERY_COOKIE)?.value, claims.userId, claims.sessionId));
    if (
      claims &&
      needsSecondFactor(claims.methods) &&
      !onResetForm &&
      !(await hasSecondFactor(
        request.cookies.get(SECOND_FACTOR_COOKIE)?.value,
        claims.userId,
        claims.sessionId,
      ))
    ) {
      await supabase.auth.signOut({ scope: "local" });
      response.cookies.delete(SECOND_FACTOR_COOKIE);
      signedOut = true;
    }
  }

  /*
    Logged out after 3 days away (D272, lib/auth/idle.ts). scope "local" ends
    this browser's session on the auth server too, so its refresh token is
    worthless afterwards, and setAll above clears the session cookies on the
    response and on the request, so the page below renders signed out. A page
    visit is sent to /login with the reason; API and in app (RSC) requests
    simply continue signed out.
  */
  if (claims && !signedOut) {
    const now = Date.now();
    const verdict = idleVerdict(request.cookies.get(IDLE_COOKIE)?.value, claims.sessionId, now);
    if (verdict === "expired") {
      await supabase.auth.signOut({ scope: "local" });
      response.cookies.delete(SECOND_FACTOR_COOKIE);
      response.cookies.delete(IDLE_COOKIE);
      if (isPageVisit(request)) {
        const redirect = NextResponse.redirect(new URL("/login?notice=idle", request.url));
        for (const c of response.cookies.getAll()) redirect.cookies.set(c);
        redirect.headers.set("cache-control", "no-store");
        return redirect;
      }
    } else if (verdict === "touch") {
      response.cookies.set(IDLE_COOKIE, idleValue(claims.sessionId, now), {
        maxAge: IDLE_COOKIE_MAX_AGE,
        httpOnly: true,
        sameSite: "lax",
        secure: request.nextUrl.protocol === "https:",
        path: "/",
      });
    }
  }

  return rememberRef(request, response);
}

/* A full page load of something other than the sign in pages: worth sending
   to /login with the reason. Not an API call, a form post or an in app (RSC)
   navigation, which would get a redirect they cannot show. */
function isPageVisit(request: NextRequest): boolean {
  if (request.method !== "GET") return false;
  if (request.headers.has("rsc") || request.nextUrl.searchParams.has("_rsc")) return false;
  const path = request.nextUrl.pathname;
  if (path.startsWith("/api/") || path.startsWith("/auth/")) return false;
  if (["/login", "/signup", "/get-started", "/verify"].includes(path)) return false;
  return (request.headers.get("accept") ?? "").includes("text/html");
}

/* A Supabase session cookie: sb-<project>-auth-token, or one of its chunks
   (.0, .1) when the session is too large for one cookie. */
const SESSION_COOKIE = /^sb-.+-auth-token(?:\.\d+)?$/;

/* A tool or model profile: exactly one segment after /tools or /models. */
const PROFILE = /^\/(?:tools|models)\/[^/]+$/;

/* Pages whose plain, no query address has a prebuilt signed out copy under
   /anon (Workers free plan, 2026-11-18). /community is not here on purpose:
   a prebuilt feed would hide new posts until the next deploy. */
const PLAIN_CACHED = new Set(["/search", "/compare", "/pricing", "/ask"]);

/* True when the only query parameter is Next's own _rsc marker, or none. */
function onlyNextParams(url: URL): boolean {
  for (const key of url.searchParams.keys()) if (key !== "_rsc") return false;
  return true;
}

/*
  The tab of a plain Explore address that has a cached signed out copy:
  /explore, or /explore?tab=<a real tab>. Any other parameter (?debug, ?why,
  a campaign tag) goes to the live page, which handles it as before. _rsc is
  Next's own marker on in app navigations and does not change the page.
*/
function exploreTab(url: URL): string | null {
  if (url.pathname !== "/explore") return null;
  for (const key of url.searchParams.keys()) {
    if (key !== "tab" && key !== "_rsc") return null;
  }
  const tab = url.searchParams.get("tab") ?? "all";
  return isExploreTab(tab) ? tab : null;
}

function rememberRef(request: NextRequest, response: NextResponse): NextResponse {
  /*
    The campaign tag (phase ONB, D227). A link posted with `?ref=tiktok-gems`
    or `?utm_source=` is remembered first party for 30 days, first touch only,
    and saved once with the onboarding answers. Letters, digits, _ and - only.
    No tracker, no third party, nothing set without a tag in the link.

    OFF unless ONBOARDING_REF_COOKIE=on. The Cookie Policy promises strictly
    necessary cookies only, and a campaign tag is not one, so it stays off
    until the founder decides on consent and the policy row (D227).
  */
  if (process.env.ONBOARDING_REF_COOKIE === "on" && !request.cookies.has(REF_COOKIE)) {
    const ref = cleanRef(request.nextUrl.searchParams.get("ref") ?? request.nextUrl.searchParams.get("utm_source"));
    if (ref) {
      response.cookies.set(REF_COOKIE, ref, {
        maxAge: REF_MAX_AGE,
        httpOnly: true,
        sameSite: "lax",
        secure: request.nextUrl.protocol === "https:",
        path: "/",
      });
    }
  }

  return response;
}

export const config = {
  matcher: [
    /* Everything except static assets, images, and the Sentry tunnel.

       /monitoring is where the browser posts error and trace payloads, routed
       through our own origin so an ad blocker cannot silently drop them
       (tunnelRoute in next.config.ts). Running the session refresh on it would
       put a Supabase round trip in front of every event the SDK sends, for a
       request that has no session and needs none.

       /api/health is excluded for the same reason: deploy checks call it with
       no session, and it must answer even if the auth service is slow. */
    /* Also left out since the 2026-11-18 usage audit: files that never need a
       session or the origin check, each of which was an edge invocation of
       its own. robots.txt, sitemap.xml and llms.txt fall under txt and xml;
       public/video under mp4; fonts under woff2. */
    "/((?!monitoring|api/health|_next/static|_next/image|favicon.ico|brand/|video/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|mp4|webm|mp3|wav|woff|woff2|ttf|txt|xml|webmanifest|map)$).*)",
  ],
};
