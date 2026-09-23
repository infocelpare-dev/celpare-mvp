import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { recordCompareEvents } from "@/lib/compare/analytics";
import { withinBurst } from "@/lib/security/burst";
import { COMPARE_EVENTS, GOALS, MAX_ITEMS } from "@/lib/compare/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/*
  Compare events, from the browser.

  A route rather than an action for the reason /api/search/events gives: it is a
  sendBeacon target on the way out of the page, and a beacon needs a plain URL.

  The event kinds are a closed list here AND in the table's CHECK. The user id
  comes from the session, never from the body. The batch is capped. The
  signature is the ordered item list and is shape checked, so it cannot carry
  anything but slugs.
*/

const schema = z.object({
  itemCount: z.number().int().min(0).max(12),
  goal: z.enum(GOALS.map((g) => g.key) as [string, ...string[]]).nullable().optional(),
  signature: z
    .string()
    .max(400)
    .regex(/^((tool|model):[a-z0-9][a-z0-9-]{0,79})(,(tool|model):[a-z0-9][a-z0-9-]{0,79}){0,11}$/)
    .nullable()
    .optional(),
  events: z
    .array(
      z.object({
        event: z.enum(COMPARE_EVENTS),
        itemType: z.enum(["tool", "model"]).optional(),
        itemId: z.string().uuid().optional(),
        position: z.number().int().min(0).max(MAX_ITEMS - 1).optional(),
        section: z.string().regex(/^[a-z_]{1,40}$/).optional(),
      }),
    )
    .min(1)
    .max(40),
});

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) return new NextResponse(null, { status: 204 });
  /* Written with the service role, so without this one script could fill the table. */
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
    /* Signed out is a perfectly good state for a comparison. */
  }

  await recordCompareEvents({
    userId,
    itemCount: parsed.data.itemCount,
    goal: (parsed.data.goal as never) ?? null,
    signature: parsed.data.signature ?? null,
    events: parsed.data.events,
  });

  return new NextResponse(null, { status: 204 });
}
