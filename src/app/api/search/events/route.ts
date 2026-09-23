import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { recordResultEvents } from "@/lib/search/analytics";
import { withinBurst } from "@/lib/security/burst";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/*
  Impressions and clicks on search results.

  WHY A ROUTE AND NOT AN ACTION: this is called with sendBeacon on the way out of
  the page, which needs a plain URL and a POST that survives the navigation. A
  server action cannot be a beacon target.

  WHAT IT WILL AND WILL NOT ACCEPT. The query and the query id come from the
  server rendered page, the position is bounded by a CHECK constraint as well as
  here, the event names are a closed list in the schema below and again in the
  database, and the batch is capped. The user id is taken from the SESSION and
  never from the body, so nobody can attribute their own clicks to somebody else.

  THE LIMIT THAT REMAINS. It is still a public endpoint, so a script holding a
  real query id can post events that did not happen. What it cannot do is inflate
  a position outside the range, invent an event kind, write as another account, or
  move a result far: BEHAVIOUR_MIN_IMPRESSIONS ignores thin data, the ranker
  scores only the click surplus over what a position earns anyway, and the whole
  behaviour term is inside the support cap. Closing it properly needs a signed
  single use token minted with each result list. Recorded as a gap rather than
  left as an assumption.
*/

const schema = z.object({
  queryId: z.string().uuid().nullable().optional(),
  query: z.string().min(1).max(200),
  events: z
    .array(
      z.object({
        resultType: z.enum(["tool", "model", "person", "post"]),
        resultId: z.string().uuid(),
        position: z.number().int().min(0).max(200),
        event: z.enum([
          "impression",
          "click",
          "save",
          "like",
          "follow",
          "share",
          "outbound",
        ]),
      }),
    )
    .min(1)
    .max(60),
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
    /* Signed out is a perfectly good state for an impression. */
  }

  await recordResultEvents({
    queryId: parsed.data.queryId ?? null,
    query: parsed.data.query,
    userId,
    events: parsed.data.events,
  });

  /* 204, because a beacon has nowhere to put a response body and nothing on the
     page is waiting for one. */
  return new NextResponse(null, { status: 204 });
}
