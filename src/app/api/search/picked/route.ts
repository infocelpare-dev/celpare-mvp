import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser, isSupabaseConfigured } from "@/lib/supabase/server";
import { recordSearch } from "@/lib/telemetry";
import { withinBurst } from "@/lib/security/burst";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/*
  A suggestion that opens a thing (a tool, a model, a person) skips the result
  page, and the result page is what records a search. So somebody who typed
  "trulata" and picked TruLata from the list searched and got no history for it
  (founder, 2026-11-25). The search box sends the typed words here as a beacon on
  the way out, and they are recorded as the search they were.

  SIGNED IN ONLY. History is the reason for this route, and a signed out visitor
  has none; it also keeps a script without an account from adding rows to the
  popular searches list. The user id comes from the session, never the body.
*/
const schema = z.object({
  q: z.string().trim().min(2).max(200),
  /* How many suggestions were on screen when one was picked. */
  n: z.number().int().min(0).max(12).default(1),
});

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) return new NextResponse(null, { status: 204 });
  if (!(await withinBurst("beacon"))) return new NextResponse(null, { status: 429 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new NextResponse(null, { status: 400 });

  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 204 });

  await recordSearch({
    query: parsed.data.q,
    resultCount: parsed.data.n,
    userId: user.id,
    source: "search",
  });
  return new NextResponse(null, { status: 204 });
}
