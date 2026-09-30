import "server-only";
import { createAnonClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { parseConstraints } from "@/lib/recommend/constraints";
import { getCatalogueIndex } from "@/lib/recommend/server/cache";
import { getRecommendations } from "@/lib/recommend/server/engine";
import { recordRecommendationEvents } from "@/lib/recommend/server/events";
import { TOOL_SEARCH_LIMIT } from "./config";
import { searchTools } from "./tool-search";
import type { ToolCitation } from "./types";

/*
  Ask Celpare's grounded candidates (4BK, ask_recommendation through
  tool_model_recommendation_v1, strategy fit).

    question -> constraints (deterministic) -> engine fit -> + keyword hits
             -> the seven column projection -> the model

  WHAT CHANGED AND WHAT DID NOT. Before this, the tools the model saw were the
  keyword search's top six. Now the engine decides WHICH catalogue tools the model
  sees and in WHAT order: it reads the stated needs ("cheaper than Cursor", "runs
  on Linux", "open source"), removes what a recorded fact rules out, and ranks the
  rest by fit. The keyword search still runs and still contributes, as one source.

  The DATA BOUNDARY IS UNCHANGED (D12, D39). The model is given exactly the
  projection search_tools returns, now read by slug through search_tools_by_slugs,
  which has the same seven column return type and runs as the caller under RLS.
  The engine's richer reading of plans and facts decides the selection, and never
  enters the prompt.

  GROUNDED BY CONSTRUCTION. Every citation is a row the projection returned for a
  slug the engine or the keyword search produced from the catalogue. Nothing the
  model writes can add a card. A product named in the question that the catalogue
  does not carry is reported in `unresolved`, never guessed.

  Any failure falls back to the keyword search alone, which is what Ask did before.
*/

export type AskCandidates = {
  citations: ToolCitation[];
  /* Set when the engine ran: the request, for attributing card impressions. */
  requestId: string | null;
  unresolved: string[];
  /* Card slug to its engine item, for the impressions. */
  engineRefs: Map<string, { id: string; position: number; reason: string | null; source: string }>;
};

async function projection(slugs: string[]): Promise<ToolCitation[]> {
  if (!isSupabaseConfigured() || slugs.length === 0) return [];
  const { data, error } = await createAnonClient().rpc("search_tools_by_slugs", { slugs });
  if (error) {
    console.error("[ai] candidate projection failed", error.code, error.message);
    return [];
  }
  const bySlug = new Map(((data ?? []) as ToolCitation[]).map((t) => [t.slug, t]));
  return slugs.map((s) => bySlug.get(s)).filter((t): t is ToolCitation => Boolean(t));
}

export async function askCandidates(question: string, topic: string, viewerId: string | null): Promise<AskCandidates> {
  const keywordOnly = async (): Promise<AskCandidates> => ({ citations: await searchTools(topic), requestId: null, unresolved: [], engineRefs: new Map() });
  try {
    const { index } = await getCatalogueIndex();
    const parsed = parseConstraints(question, index);
    /* A question about models only is answered by the benchmark evidence path
       (D118); the tool cards stay keyword driven there, as before. */
    if (!parsed.entityTypes.includes("tool")) return keywordOnly();

    const [keyword, view] = await Promise.all([
      searchTools(topic),
      getRecommendations(
        { surface: "ask", strategy: "fit", entityTypes: ["tool"], query: question, constraints: parsed.constraints, limit: TOOL_SEARCH_LIMIT, section: "ask" },
        viewerId,
      ),
    ]);
    if (!view.ok) return { citations: keyword, requestId: null, unresolved: parsed.unresolved, engineRefs: new Map() };

    const ruledOut = new Set(
      view.result.rejected.filter((r) => r.code === "failed_constraint" || r.code === "excluded" || r.code === "fixture" || r.code === "dismissed").map((r) => r.key),
    );
    const engineSlugs = view.result.items.map((i) => view.entities[i.key]?.slug).filter((s): s is string => Boolean(s));
    const order = [...engineSlugs];
    for (const k of keyword) {
      if (order.length >= TOOL_SEARCH_LIMIT) break;
      const e = index.bySlug.get(`tool:${k.slug}`);
      if (e && ruledOut.has(e.key)) continue;
      if (!order.includes(k.slug)) order.push(k.slug);
    }

    const citations = await projection(order.slice(0, TOOL_SEARCH_LIMIT));
    if (citations.length === 0) return { ...(await keywordOnly()), unresolved: parsed.unresolved };

    const engineRefs = new Map<string, { id: string; position: number; reason: string | null; source: string }>();
    view.result.items.forEach((it, position) => {
      const slug = view.entities[it.key]?.slug;
      if (slug) engineRefs.set(slug, { id: it.ref.id, position, reason: it.reason?.code ?? null, source: it.source });
    });
    return { citations, requestId: view.result.requestId, unresolved: parsed.unresolved, engineRefs };
  } catch (err) {
    console.error("[ai] engine candidates failed, keyword search only", err);
    return keywordOnly();
  }
}

/* The cards were shown: one impression per engine card, attributed to the
   request. Server side, because the cards are drawn from this stream. */
export async function recordAskImpressions(c: AskCandidates, userId: string | null, shownSlugs: string[]): Promise<void> {
  if (!c.requestId) return;
  const events = shownSlugs.flatMap((slug) => {
    const r = c.engineRefs.get(slug);
    return r ? [{ entityType: "tool" as const, entityId: r.id, event: "impression" as const, position: r.position, reason: r.reason, source: r.source }] : [];
  });
  if (events.length === 0) return;
  await recordRecommendationEvents({ userId, sessionId: null, surface: "ask", strategy: "fit", requestId: c.requestId, variant: null, section: "ask", events });
}
