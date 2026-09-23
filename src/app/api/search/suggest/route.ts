import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAnonClient, createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { Suggestion } from "@/lib/search/types";
import { withinBurst } from "@/lib/security/burst";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/*
  Autocomplete.

  WHY THIS IS A ROUTE AND NOT A SERVER ACTION. A server action is a POST that
  Next routes through the React action protocol and it cannot be cancelled, cached
  or raced sensibly. Autocomplete is a read that fires on a keystroke and whose
  previous answer stops mattering the instant the next one is typed, so it wants
  GET, AbortController and the browser's own request coalescing.

  IT IS CHEAP BY CONSTRUCTION. public.search_suggest touches prefix and trigram
  indexes and nothing else: no engagement aggregates, no behaviour joins, no
  ranking module, no AI. The client debounces on top of that. Both halves are
  needed, because a debounce is a courtesy and the function's cost is the control.

  NOTHING HERE IS RECORDED. A keystroke is not a search: recording one would fill
  search_events with prefixes of real queries and make every popularity number
  wrong. The search itself is recorded by the page, once, when it runs.

  IT READS AS THE CALLER when there is a session, because one arm of
  search_suggest is the caller's OWN recent searches. With the anon client that
  arm returns nothing, which is exactly right for a signed out visitor.
*/

const schema = z.object({
  q: z.string().max(120),
  limit: z.coerce.number().int().min(1).max(12).default(8),
});

export async function GET(request: NextRequest) {
  const parsed = schema.safeParse({
    q: request.nextUrl.searchParams.get("q") ?? "",
    limit: request.nextUrl.searchParams.get("limit") ?? 8,
  });

  if (!parsed.success) {
    return NextResponse.json({ suggestions: [] }, { status: 400 });
  }

  const q = parsed.data.q.trim();
  /* One character matches most of the catalogue, so it is not a suggestion, it is
     a table scan with a dropdown attached. */
  if (q.length < 2 || !isSupabaseConfigured()) {
    return NextResponse.json({ suggestions: [] });
  }
  if (!(await withinBurst("suggest"))) {
    return NextResponse.json({ suggestions: [] }, { status: 429 });
  }

  try {
    const anon = createAnonClient();
    let db = anon;

    /* A session, if there is one. createClient reads cookies, which is why this
       route is force-dynamic. */
    try {
      const session = await createClient();
      const {
        data: { user },
      } = await session.auth.getUser();
      if (user) db = session;
    } catch {
      /* No session is not an error here. Fall through as anon. */
    }

    const { data, error } = await db.rpc("search_suggest", {
      p_q: q,
      p_limit: parsed.data.limit,
    });

    if (error) {
      console.error("[search] suggest failed", error.code, error.message);
      return NextResponse.json({ suggestions: [] });
    }

    const suggestions: Suggestion[] = (
      (data as Record<string, unknown>[] | null) ?? []
    ).map((row) => ({
      kind: String(row.kind) as Suggestion["kind"],
      label: String(row.label ?? ""),
      sublabel: (row.sublabel as string | null) ?? null,
      href: String(row.href ?? ""),
    }));

    const response = NextResponse.json({ suggestions });
    /* Private, because one arm is the caller's own history. A shared cache here
       would serve one person's recent searches to the next visitor. */
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (err) {
    console.error("[search] suggest threw", err);
    return NextResponse.json({ suggestions: [] });
  }
}
