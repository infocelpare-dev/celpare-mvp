import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  recordVideoEvents,
  VIDEO_EVENTS,
  VIDEO_SOURCES,
} from "@/lib/community/video-analytics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/*
  Watch signals from the vertical video viewer.

  WHY A ROUTE AND NOT A SERVER ACTION, the same reason the search events route
  gives: these are flushed with sendBeacon when the page is hidden or unloaded,
  which needs a plain URL and a POST that survives the navigation. A server action
  cannot be a beacon target.

  THE USER ID COMES FROM THE SESSION AND NEVER FROM THE BODY. Without that rule
  anybody could attribute their own watch time to somebody else's account, which
  for a signal a ranker will later read is the whole attack.

  EVERYTHING ELSE IS BOUNDED TWICE, here and by a CHECK on the table. The event
  names are a closed list in both places, the post id has to be a uuid, the
  measures are clamped, and the batch is capped. A post id that does not exist is
  refused by the foreign key rather than by a lookup here.
*/

const schema = z.object({
  source: z.enum(VIDEO_SOURCES).default("video"),
  /* Groups a signed out person's events within one sitting. Ignored outright for
     a signed in one, so it cannot become a second identifier beside the account. */
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
        event: z.enum(VIDEO_EVENTS),
        position: z.number().int().min(0).max(500).nullable().optional(),
        watchMs: z.number().int().min(0).max(86_400_000).nullable().optional(),
        percentWatched: z.number().int().min(0).max(100).nullable().optional(),
        durationMs: z.number().int().min(0).max(86_400_000).nullable().optional(),
      }),
    )
    .min(1)
    .max(40),
});

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) return new NextResponse(null, { status: 204 });

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
    /* Signed out is a perfectly good state for a watch event. The feed is public
       and so is watching it. */
  }

  await recordVideoEvents({
    userId,
    sessionId: parsed.data.sessionId ?? null,
    source: parsed.data.source,
    events: parsed.data.events,
  });

  /* 204: a beacon has nowhere to put a response body and nothing on the page is
     waiting for one. */
  return new NextResponse(null, { status: 204 });
}
