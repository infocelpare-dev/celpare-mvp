import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  FEED_EVENTS,
  FEED_SURFACES,
  recordFeedEvents,
} from "@/lib/community/intelligence/server/events";
import { withinBurst } from "@/lib/security/burst";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/*
  Impressions, opens and dwell from the feed. A route rather than a server
  action because it is a sendBeacon target, the same reason the video and search
  event routes give.

  THE USER ID COMES FROM THE SESSION, NEVER THE BODY. Everything else is bounded
  here and by CHECKs on feed_events, and the shared beacon limiter caps how fast
  one address can write.
*/

const schema = z.object({
  surface: z.enum(FEED_SURFACES),
  algorithm: z.string().max(40).nullable().optional(),
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
        postId: z.string().uuid(),
        event: z.enum(FEED_EVENTS),
        position: z.number().int().min(0).max(500).nullable().optional(),
        dwellMs: z.number().int().min(0).max(86_400_000).nullable().optional(),
        reason: z.string().max(40).nullable().optional(),
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
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid event." }, { status: 400 });
  }

  let userId: string | null = null;
  try {
    const db = await createClient();
    const {
      data: { user },
    } = await db.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    /* Signed out is a normal state for reading the public feed. */
  }

  await recordFeedEvents({
    userId,
    sessionId: parsed.data.sessionId ?? null,
    surface: parsed.data.surface,
    algorithm: parsed.data.algorithm ?? null,
    variant: parsed.data.variant ?? null,
    events: parsed.data.events,
  });

  return new NextResponse(null, { status: 204 });
}
