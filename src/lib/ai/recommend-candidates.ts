import "server-only";
import { createAnonClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { parseConstraints } from "@/lib/recommend/constraints";
import { getCatalogueIndex } from "@/lib/recommend/server/cache";
import { getRecommendations } from "@/lib/recommend/server/engine";
import { recordRecommendationEvents } from "@/lib/recommend/server/events";
import { TOOL_SEARCH_LIMIT } from "./config";
import { searchTools } from "./tool-search";
import { getSponsoredCampaigns } from "@/lib/sponsored/server";
import type { SponsoredCandidate } from "@/lib/sponsored/rank";
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
  /*
    Sponsored tools the Ask retrieval found for this question (D204, D205),
    with how well each matched, for the separate sponsored ranking. NEVER
    given to the model: the written answer is the same with or without them.
  */
  sponsored: AskSponsoredCandidate[];
};

export type AskSponsoredCandidate = SponsoredCandidate & { slug: string };

/* How deep the catalogue search goes when looking for a matching sponsored
   tool. search_tools caps at 20; the model still sees TOOL_SEARCH_LIMIT. */
const SPONSORED_SEARCH_DEPTH = 20;

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
  const keywordOnly = async (): Promise<AskCandidates> => ({ citations: await searchTools(topic), requestId: null, unresolved: [], engineRefs: new Map(), sponsored: [] });
  try {
    const { index } = await getCatalogueIndex();
    const parsed = parseConstraints(question, index);
    /* A question about models only is answered by the benchmark evidence path
       (D118); the tool cards stay keyword driven there, as before. */
    if (!parsed.entityTypes.includes("tool")) return keywordOnly();

    const sponsoredIds = new Set((await getSponsoredCampaigns()).map((c) => c.toolId));
    const [keyword, view, deep] = await Promise.all([
      searchTools(topic),
      getRecommendations(
        { surface: "ask", strategy: "fit", entityTypes: ["tool"], query: question, constraints: parsed.constraints, limit: TOOL_SEARCH_LIMIT, section: "ask" },
        viewerId,
      ),
      /* Only searched when something is sponsored, so Ask pays nothing for
         ads on the days there are none. */
      sponsoredIds.size > 0 ? searchTools(topic, SPONSORED_SEARCH_DEPTH) : Promise.resolve([]),
    ]);

    /*
      Sponsored candidates (D205): a sponsored tool the Ask retrieval returned
      for this question, minus anything the question's own needs rule out
      ("free", "runs on Linux"). Fit is whether the engine, which applies the
      question's constraints, kept it. The relevance here is only an order;
      the gate is applied on Search's scale by askSponsoredCandidates. Paying
      buys a labelled slot among matching tools, never a place on an
      unrelated question.
    */
    const sponsoredFrom = (engine: string[], keywordOrder: string[], ruledOut: Set<string>): AskSponsoredCandidate[] => {
      const out = new Map<string, AskSponsoredCandidate>();
      const add = (slug: string, relevance: number, fit: number) => {
        const e = index.bySlug.get(`tool:${slug}`);
        if (!e || e.ref.type !== "tool" || !sponsoredIds.has(e.ref.id) || ruledOut.has(e.key)) return;
        const prev = out.get(slug);
        if (!prev || relevance > prev.relevance) out.set(slug, { slug, toolId: e.ref.id, relevance, fit: Math.max(fit, prev?.fit ?? 0) });
      };
      engine.forEach((slug, i) => add(slug, 1 - (0.4 * i) / Math.max(1, engine.length), 1));
      keywordOrder.forEach((slug, i) => add(slug, 0.7 - (0.5 * i) / Math.max(1, keywordOrder.length), 0.6));
      return [...out.values()];
    };
    const keywordOrder = [...new Set([...keyword, ...deep].map((k) => k.slug))];

    if (!view.ok) {
      return {
        citations: keyword,
        requestId: null,
        unresolved: parsed.unresolved,
        engineRefs: new Map(),
        sponsored: sponsoredFrom([], keywordOrder, new Set()),
      };
    }

    const ruledOut = new Set(
      view.result.rejected.filter((r) => r.code === "failed_constraint" || r.code === "excluded" || r.code === "fixture" || r.code === "dismissed").map((r) => r.key),
    );
    const engineSlugs = view.result.items.map((i) => view.entities[i.key]?.slug).filter((s): s is string => Boolean(s));
    const sponsored = sponsoredFrom(engineSlugs, keywordOrder, ruledOut);
    const order = [...engineSlugs];
    for (const k of keyword) {
      if (order.length >= TOOL_SEARCH_LIMIT) break;
      const e = index.bySlug.get(`tool:${k.slug}`);
      if (e && ruledOut.has(e.key)) continue;
      if (!order.includes(k.slug)) order.push(k.slug);
    }

    const citations = await projection(order.slice(0, TOOL_SEARCH_LIMIT));
    if (citations.length === 0) return { ...(await keywordOnly()), unresolved: parsed.unresolved, sponsored };

    const engineRefs = new Map<string, { id: string; position: number; reason: string | null; source: string }>();
    view.result.items.forEach((it, position) => {
      const slug = view.entities[it.key]?.slug;
      if (slug) engineRefs.set(slug, { id: it.ref.id, position, reason: it.reason?.code ?? null, source: it.source });
    });
    return { citations, requestId: view.result.requestId, unresolved: parsed.unresolved, engineRefs, sponsored };
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
