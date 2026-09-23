import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAnonClient, createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { runSearch } from "@/lib/search/engine";
import { loadRecommendations } from "@/lib/search/recommendations";
import type { OptionGroups, OptionRow } from "@/lib/compare/types";
import { withinBurst } from "@/lib/security/burst";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/*
  What the Add to comparison selector lists.

  THERE IS NO SECOND SEARCH ENGINE HERE. A typed query goes through runSearch,
  the same pipeline /search uses, with record: false because a keystroke in a
  picker is not a search (the suggest route makes the same call). Only its tool
  and model results are kept, in the order it ranked them.

  WITH NO QUERY, four groups, each from something that already exists:
    Recent      my_recent_activity, the caller's own tool views. SECURITY DEFINER,
                answers only for auth.uid().
    Saved       the caller's own collections, read as the caller under uci_select_auth.
    Suggested   loadRecommendations, the pass Explore's "Recommended" shelves use,
                in its order and never re-ranked here.
    Categories  the category list, so somebody can browse a kind of tool.
  A category is a filter on tools, not a ranking: tools in it, alphabetical.

  THERE IS NO "POPULAR" GROUP, AND THAT IS DELIBERATE. tools.popularity_score is
  0 on every row and nothing maintains it (ranking.ts records the same finding).
  A list labelled Popular ordered by a column of zeros would be a false claim.

  EVERYTHING HERE IS PUBLIC OR THE CALLER'S OWN, and every tool and model row is
  status = 'approved', so a developer's draft cannot be offered for comparison
  even though RLS would show it to them.
*/

const schema = z.object({
  q: z.string().max(120).default(""),
  category: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,79}$/)
    .optional(),
  /* The tab asking. Tools and Models are separate comparisons, so each tab's
     selector offers only its own kind. */
  type: z.enum(["tool", "model"]).optional(),
});

type Row = Record<string, unknown>;

function toolRow(r: Row): OptionRow {
  return {
    type: "tool",
    id: String(r.id),
    slug: String(r.slug),
    name: String(r.name),
    sublabel: (r.tagline as string | null) ?? null,
    logoUrl: (r.logo_url as string | null) ?? null,
  };
}

function modelRow(r: Row): OptionRow {
  return {
    type: "model",
    id: String(r.id),
    slug: String(r.slug),
    name: String(r.name),
    sublabel: (r.provider as string | null) ?? null,
    logoUrl: null,
  };
}

export async function GET(request: NextRequest) {
  const out: OptionGroups = {
    results: [],
    recent: [],
    saved: [],
    suggestedTools: [],
    suggestedModels: [],
    categories: [],
    degraded: false,
  };

  const parsed = schema.safeParse({
    q: request.nextUrl.searchParams.get("q") ?? "",
    category: request.nextUrl.searchParams.get("category") ?? undefined,
    type: request.nextUrl.searchParams.get("type") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json(out, { status: 400 });
  if (!isSupabaseConfigured()) return NextResponse.json(out);
  /* Each call runs the full search pipeline, so it is capped like autocomplete. */
  if (!(await withinBurst("compare_options"))) return NextResponse.json(out, { status: 429 });

  const anon = createAnonClient();
  let session: Awaited<ReturnType<typeof createClient>> | null = null;
  let viewerId: string | null = null;
  try {
    const db = await createClient();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (user) {
      session = db;
      viewerId = user.id;
    }
  } catch {
    /* Signed out: Recent and Saved are simply empty. */
  }

  const q = parsed.data.q.trim();

  try {
    if (q.length >= 2) {
      const results = await runSearch({
        query: q,
        tab: "all",
        signedIn: Boolean(viewerId),
        viewerId,
        record: false,
      });
      const tools = results.tools.slice(0, 8).map((s) => ({
        type: "tool" as const,
        id: s.candidate.id,
        slug: s.candidate.slug,
        name: s.candidate.name,
        sublabel: s.candidate.tagline,
        logoUrl: s.candidate.logoUrl,
      }));
      const models = results.models.slice(0, 6).map((s) => ({
        type: "model" as const,
        id: s.candidate.id,
        slug: s.candidate.slug,
        name: s.candidate.name,
        sublabel: s.candidate.provider,
        logoUrl: null,
      }));
      out.results = [...tools, ...models];
    } else if (parsed.data.category) {
      const { data, error } = await anon
        .from("tools")
        .select("id, slug, name, tagline, logo_url, tool_categories!inner(categories!inner(slug))")
        .eq("status", "approved")
        .eq("tool_categories.categories.slug", parsed.data.category)
        .order("name")
        .limit(30);
      if (error) {
        console.error("[compare] category options failed", error.code, error.message);
        out.degraded = true;
      }
      out.results = ((data as Row[] | null) ?? []).map(toolRow);
    } else {
      const [recent, saved, suggested, categories] = await Promise.all([
        session ? session.rpc("my_recent_activity", { p_limit: 20 }) : null,
        session
          ? session
              .from("user_collection_items")
              .select(
                "created_at, tools(id, slug, name, tagline, logo_url, status), models(id, slug, name, provider, status), user_collections!inner(user_id, deleted_at)",
              )
              .eq("user_collections.user_id", viewerId!)
              .is("user_collections.deleted_at", null)
              .is("post_id", null)
              .order("created_at", { ascending: false })
              .limit(40)
          : null,
        loadRecommendations({ signedIn: Boolean(viewerId), viewerId }).catch((err) => {
          console.error("[compare] suggestions failed", err);
          out.degraded = true;
          return null;
        }),
        anon.from("categories").select("slug, name").order("sort_order").order("name"),
      ]);

      /* Recent: the rpc returns hrefs, not ids, so the slugs are resolved against
         the public table. That second read is also what drops anything that has
         been unpublished since it was viewed. */
      if (recent && !recent.error) {
        const slugs = ((recent.data as Row[] | null) ?? [])
          .filter((r) => r.kind === "tool" && typeof r.href === "string")
          .map((r) => String(r.href).replace(/^\/tools\//, ""))
          .slice(0, 6);
        if (slugs.length > 0) {
          const { data } = await anon
            .from("tools")
            .select("id, slug, name, tagline, logo_url")
            .eq("status", "approved")
            .in("slug", slugs);
          const bySlug = new Map(((data as Row[] | null) ?? []).map((r) => [String(r.slug), r]));
          out.recent = slugs
            .map((s) => bySlug.get(s))
            .filter((r): r is Row => Boolean(r))
            .map(toolRow);
        }
      } else if (recent?.error) {
        out.degraded = true;
      }

      if (saved && !saved.error) {
        const seen = new Set<string>();
        for (const r of (saved.data as Row[] | null) ?? []) {
          const t = r.tools as Row | null;
          const m = r.models as Row | null;
          const row = t && t.status === "approved" ? toolRow(t) : m && m.status === "approved" ? modelRow(m) : null;
          if (!row) continue;
          const key = `${row.type}:${row.slug}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.saved.push(row);
          if (out.saved.length === 8) break;
        }
      } else if (saved?.error) {
        console.error("[compare] saved options failed", saved.error.code, saved.error.message);
        out.degraded = true;
      }

      if (suggested) {
        out.suggestedTools = suggested.tools.slice(0, 6).map((s) => ({
          type: "tool" as const,
          id: s.candidate.id,
          slug: s.candidate.slug,
          name: s.candidate.name,
          sublabel: s.candidate.tagline,
          logoUrl: s.candidate.logoUrl,
        }));
        out.suggestedModels = suggested.models.slice(0, 6).map((s) => ({
          type: "model" as const,
          id: s.candidate.id,
          slug: s.candidate.slug,
          name: s.candidate.name,
          sublabel: s.candidate.provider,
          logoUrl: null,
        }));
      }

      if (!categories.error) {
        out.categories = ((categories.data as Row[] | null) ?? []).map((c) => ({
          slug: String(c.slug),
          name: String(c.name),
        }));
      }
    }
  } catch (err) {
    console.error("[compare] options threw", err);
    out.degraded = true;
  }

  const only = parsed.data.type;
  if (only) {
    const keep = (rows: OptionRow[]) => rows.filter((r) => r.type === only);
    out.results = keep(out.results);
    out.recent = keep(out.recent);
    out.saved = keep(out.saved);
    if (only === "model") {
      out.suggestedTools = [];
      out.categories = [];
    } else {
      out.suggestedModels = [];
    }
  }

  const response = NextResponse.json(out);
  /* Private: Recent and Saved are the caller's own. */
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
