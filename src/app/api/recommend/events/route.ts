import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { recordRecommendationEvents } from "@/lib/recommend/server/events";
import { SURFACES, STRATEGIES } from "@/lib/recommend/types";
import { withinBurst } from "@/lib/security/burst";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/*
  Tool and model recommendation impressions and opens (4BK, D184). A route
  rather than a server action because it is a sendBeacon target, the same reason
  the feed, Explore and search event routes give.

  THE USER ID COMES FROM THE SESSION, NEVER THE BODY. Only what a browser can
  honestly observe is accepted here: impression, click and compare_add. Saves
  are recorded where the save happens; not interested goes through the server
  action, which needs a signed in person. The shared beacon limiter caps how
  fast one address can write, and the table's CHECKs bound every column again.
*/

const schema = z.object({
  surface: z.enum(SURFACES as [string, ...string[]]),
  strategy: z.enum(STRATEGIES as [string, ...string[]]),
  requestId: z.string().uuid().nullable().optional(),
  variant: z.string().max(40).nullable().optional(),
  section: z.string().max(40).nullable().optional(),
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
        entityType: z.enum(["tool", "model"]),
        entityId: z.string().uuid(),
        event: z.enum(["impression", "click", "compare_add"]),
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
    /* Signed out is a normal state for reading a tool page. */
  }

  const d = parsed.data;
  await recordRecommendationEvents({
    userId,
    sessionId: d.sessionId ?? null,
    surface: d.surface as (typeof SURFACES)[number],
    strategy: d.strategy as (typeof STRATEGIES)[number],
    requestId: d.requestId ?? null,
    variant: d.variant ?? null,
    section: d.section ?? null,
    events: d.events.map((e) => ({
      entityType: e.entityType,
      entityId: e.entityId,
      event: e.event,
      position: e.position ?? null,
      reason: e.reason ?? null,
      source: e.source ?? null,
    })),
  });
  return new NextResponse(null, { status: 204 });
}
