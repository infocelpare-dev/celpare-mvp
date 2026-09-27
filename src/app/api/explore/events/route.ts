import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { EXPLORE_EVENT_TYPES, EXPLORE_EVENTS, recordExploreEvents } from "@/lib/explore/intelligence/server/events";
import { withinBurst } from "@/lib/security/burst";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/*
  Explore impressions and clicks (4BI, D151). A route rather than a server
  action because it is a sendBeacon target, the same reason the feed, video and
  search event routes give.

  THE USER ID COMES FROM THE SESSION, NEVER THE BODY. Everything else is bounded
  here and again by the CHECKs on feed_events and recommendation_events, and
  the shared beacon limiter caps how fast one address can write. Only the
  events a browser can honestly observe are accepted: impression, click, play.
  Dismisses go through the server action, which needs a signed in person.
*/

const schema = z.object({
  variant: z.string().max(40).nullable().optional(),
  sessionId: z
    .string()
    .min(8)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/)
    .nullable()
    .optional(),
  events: z
    .array(
      z.object({
        entityType: z.enum(EXPLORE_EVENT_TYPES),
        entityId: z.string().min(1).max(80),
        event: z.enum(EXPLORE_EVENTS).refine((e) => e === "impression" || e === "click" || e === "play"),
        section: z.string().max(40).nullable().optional(),
        position: z.number().int().min(0).max(500).nullable().optional(),
        reason: z.string().max(40).nullable().optional(),
        source: z.string().max(40).nullable().optional(),
      }),
    )
    .min(1)
    .max(60),
});

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) return new NextResponse(null, { status: 204 });
  if (!(await withinBurst("beacon"))) return new NextResponse(null, { status: 429 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid event." }, { status: 400 });

  let userId: string | null = null;
  try {
    const db = await createClient();
    const {
      data: { user },
    } = await db.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    /* Signed out is a normal state for reading Explore. */
  }

  await recordExploreEvents({
    userId,
    sessionId: parsed.data.sessionId ?? null,
    variant: parsed.data.variant ?? null,
    events: parsed.data.events.map((e) => ({
      entityType: e.entityType,
      entityId: e.entityId,
      event: e.event,
      section: e.section ?? null,
      position: e.position ?? null,
      reason: e.reason ?? null,
      source: e.source ?? null,
    })),
  });
  return new NextResponse(null, { status: 204 });
}
