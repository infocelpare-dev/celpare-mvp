import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { withinBurst } from "@/lib/security/burst";
import { CLIENT_EVENTS, recordSponsoredEvents, viewerKey } from "@/lib/sponsored/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/*
  Sponsored card events (D205): view, click, save, conversion, dismiss and
  report. A route rather than a server action because it is a sendBeacon target.

  THE VIEWER COMES FROM THE SESSION OR THE SIGNED ANON COOKIE, NEVER THE BODY.
  The body names a tool; the server checks it is sponsored right now and looks
  up the sponsorship itself. The shared beacon limiter caps how fast one
  address can write. No charge follows from any event: the sponsorship is a
  flat monthly fee (D205).
*/

const schema = z.object({
  surface: z.enum(["search", "ask"]),
  requestId: z.string().uuid().nullable().optional(),
  events: z
    .array(
      z.object({
        toolId: z.string().uuid(),
        event: z.enum(CLIENT_EVENTS),
        position: z.number().int().min(0).max(2).nullable().optional(),
        reason: z.string().max(20).nullable().optional(),
      }),
    )
    .min(1)
    .max(20),
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
    /* Signed out is a normal state for seeing an ad. */
  }

  const d = parsed.data;
  await recordSponsoredEvents({
    viewer: await viewerKey(userId),
    userId,
    surface: d.surface,
    requestId: d.requestId ?? null,
    events: d.events.map((e) => ({
      toolId: e.toolId,
      event: e.event,
      position: e.position ?? null,
      reason: e.reason ?? null,
    })),
  });
  return new NextResponse(null, { status: 204 });
}
