import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { searchTools } from "@/lib/ai/tool-search";
import { identify } from "@/lib/ai/identity";
import { checkLimits, countMessage } from "@/lib/ai/ratelimit";
import { recordSearch } from "@/lib/telemetry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/*
  The Tool Search API, as Notion draws it:

    /search-tools?q=video editing
      -> returns only name, description, pricing, tags, rating, features

  Rate limited on the same counters as the chat, which is the founder's note
  "block ai agents to call tool search api" made real. It cannot be made
  impossible for a script to call a public endpoint, but it can be made
  pointless: the limit is per identity and the payload is already the minimum
  the product needs, so scraping this gets you the public catalogue slowly
  rather than anything that is not already on the tool pages.
*/

const schema = z.object({
  q: z.string().max(200).default(""),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

export async function GET(request: NextRequest) {
  const parsed = schema.safeParse({
    q: request.nextUrl.searchParams.get("q") ?? "",
    limit: request.nextUrl.searchParams.get("limit") ?? 8,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query." }, { status: 400 });
  }

  const identity = await identify();
  const verdict = await checkLimits(identity.subject, identity.plan);
  if (!verdict.allowed) {
    return NextResponse.json(
      { error: verdict.message, resetsAt: verdict.resetsAt },
      { status: 429 },
    );
  }
  await countMessage(identity.subject);

  const tools = await searchTools(parsed.data.q, parsed.data.limit);

  /*
    Record the outcome, after the fact.

    Not awaited and never allowed to throw: the search has already run and
    returned, so logging it cannot slow the query down, cannot change what it
    finds, and cannot fail the request. A zero result search is the single most
    useful row in that table, which is why the count is recorded rather than
    only the successes.

    Written server side with the service role rather than through a public
    insert policy, so nobody can manufacture searches and bury the real ones.
  */
  void recordSearch({
    query: parsed.data.q,
    resultCount: tools.length,
    userId: identity.userId,
    source: "api",
  });

  const response = NextResponse.json({ tools });
  if (identity.setCookie) {
    response.cookies.set(identity.setCookie.name, identity.setCookie.value, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: identity.setCookie.maxAge,
    });
  }
  return response;
}
