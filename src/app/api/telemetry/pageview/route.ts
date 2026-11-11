import { NextResponse, after, type NextRequest } from "next/server";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { withinBurst } from "@/lib/security/burst";
import { cleanPath, isBot, referrerHost } from "@/lib/statsig/core";
import { buildEvent, sendEvents, statsigOn } from "@/lib/statsig/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/*
  A page view, posted by components/analytics/pageview-beacon.tsx (D264).

  WHY A ROUTE: it is a sendBeacon target, which needs a plain URL, the same
  reason as the feed and search event routes.

  WHAT IT TRUSTS. Only the path and the referrer come from the body, and both
  are cleaned to a report row (core.ts). Who the visitor is comes from the
  session and the request, never the body. Same origin only, browsers only, and
  the beacon burst limit, so a script cannot fill the reports cheaply. Nothing
  is written to our database; the event goes to Statsig after the response.

  Always 204, even when refused, so the beacon has nothing to retry.
*/

const done = () => new NextResponse(null, { status: 204 });

function sameOrigin(request: NextRequest): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!statsigOn()) return done();
  if (!sameOrigin(request) || isBot(request.headers.get("user-agent"))) return done();
  if (!(await withinBurst("beacon"))) return done();

  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return done();
  }
  const b = (body ?? {}) as { path?: unknown; referrer?: unknown };
  const path = cleanPath(b.path);
  if (!path) return done();

  let userId: string | null = null;
  if (isSupabaseConfigured()) {
    try {
      const {
        data: { user },
      } = await (await createClient()).auth.getUser();
      userId = user?.id ?? null;
    } catch {
      /* Counted as signed out rather than dropped. */
    }
  }

  const event = buildEvent(request.headers, "page_view", {
    userId,
    metadata: {
      path,
      section: path.split("/")[1] || "home",
      referrer: referrerHost(b.referrer, request.headers.get("host")),
    },
  });
  after(() => sendEvents([event]));
  return done();
}
