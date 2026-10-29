import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { COMMENT_MODES } from "@/lib/comments/intelligence/config";
import { recordCommentEvents } from "@/lib/comments/intelligence/server/events";
import { withinBurst } from "@/lib/security/burst";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/*
  Comment impressions (guide 20). A route rather than a server action because
  it is a sendBeacon target, like the feed and Explore event routes.

  THE USER ID COMES FROM THE SESSION, NEVER THE BODY. Only impressions are
  accepted here, the one thing a browser can honestly observe; likes, replies,
  hides and reports are logged by the actions that perform them.
*/

const schema = z.object({
  algorithm: z.string().max(60).nullable().optional(),
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
        commentId: z.string().uuid(),
        mode: z.enum(COMMENT_MODES),
        position: z.number().int().min(0).max(500).nullable(),
        depth: z.number().int().min(0).max(200),
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
  if (!parsed.success) return NextResponse.json({ error: "Invalid event." }, { status: 400 });

  let userId: string | null = null;
  try {
    const db = await createClient();
    const {
      data: { user },
    } = await db.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    /* Signed out is a normal state for reading comments. */
  }

  await recordCommentEvents({
    userId,
    sessionId: parsed.data.sessionId ?? null,
    algorithm: parsed.data.algorithm ?? null,
    events: parsed.data.events.map((e) => ({
      commentId: e.commentId,
      event: "impression" as const,
      mode: e.mode,
      position: e.position,
      depth: e.depth,
      reason: e.reason ?? null,
    })),
  });

  return new NextResponse(null, { status: 204 });
}
