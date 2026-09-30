import "server-only";
import { cache } from "react";
import { TMR_V1 } from "../config";
import type { CatalogueIndex } from "../catalogue";
import { recommend } from "../pipeline";
import { contextPreference } from "../tiebreak";
import type { EntityType, RecommendationRequest, RecommendationResult, ToolModelEntity } from "../types";
import { emptyUserContext } from "../user";
import { assignTmrVariant } from "../versions";
import { getCatalogueIndex } from "./cache";
import { loadUserContext } from "./user";

/*
  tool_model_recommendation_v1 on the server (guide 17 section 3).

  getRecommendations(request, viewerId) is the ONE entry point every surface
  calls. It loads the cached catalogue index, the viewer's context when the
  strategy reads it, runs the pure pipeline, and returns the result with the
  display fields the cards need. React cache() makes identical calls in one
  render one computation; signed out results are also kept for 60 seconds, since
  they are the same for everybody.

  Returns { ok: false } when the catalogue could not be read at all, so a page
  says the section failed instead of drawing an empty list (D109).
*/

export type CardEntity = {
  key: string;
  type: EntityType;
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  logoUrl: string | null;
  provider: string | null;
  href: string;
};

export type RecommendationView =
  | {
      ok: true;
      result: RecommendationResult;
      /* Display fields for the items, the seeds and (in debug) the rejected. */
      entities: Record<string, CardEntity>;
      failed: string[];
      timings: { index: number; build: number; user: number; pipeline: number; cachedIndex: boolean };
    }
  | { ok: false; reason: string };

const PERSONAL: ReadonlySet<RecommendationRequest["strategy"]> = new Set(["personalized", "fit", "similar", "contextual", "alternative"]);

const anonResults = new Map<string, { at: number; value: RecommendationView }>();

export function cardOf(e: ToolModelEntity): CardEntity {
  return {
    key: e.key,
    type: e.ref.type,
    id: e.ref.id,
    slug: e.slug,
    name: e.name,
    tagline: e.tagline ?? (e.description ? e.description.slice(0, 140) : null),
    logoUrl: e.logoUrl,
    provider: e.providerLabel,
    href: e.ref.type === "tool" ? `/tools/${e.slug}` : `/models/${e.slug}`,
  };
}

/* One read of the viewer per request, however many lists a page shows. Keyed by
   the index generation so a rebuilt index is read against a fresh context. */
const userFor = cache((viewerId: string | null, _generation: string, network: boolean, index: CatalogueIndex) =>
  loadUserContext(viewerId, index, { network, now: Date.now() }),
);

async function compute(reqJson: string, viewerId: string | null): Promise<RecommendationView> {
  const req = JSON.parse(reqJson) as RecommendationRequest;
  const now = Date.now();
  let load;
  try {
    load = await getCatalogueIndex();
  } catch (err) {
    console.error("[recommend] index failed", err);
    return { ok: false, reason: "The catalogue could not be read." };
  }
  if (load.index.list.length === 0) return { ok: false, reason: load.failed.length ? "The catalogue could not be read." : "The catalogue is empty." };

  const wantsUser = Boolean(viewerId) && PERSONAL.has(req.strategy);
  const userLoad = wantsUser
    ? await userFor(viewerId, load.index.generation, req.strategy === "personalized", load.index)
    : { user: emptyUserContext(null), failed: [], ms: 0 };

  const t = Date.now();
  const assignment = assignTmrVariant(viewerId ?? req.sessionId ?? null);
  const result = recommend({ request: { ...req, userId: viewerId }, index: load.index, user: userLoad.user, now, requestId: crypto.randomUUID(), assignment });
  const pipelineMs = Date.now() - t;

  const entities: Record<string, CardEntity> = {};
  for (const it of result.items) {
    const e = load.index.entities.get(it.key);
    if (e) entities[it.key] = cardOf(e);
  }
  for (const s of req.seeds ?? []) {
    const e = load.index.entities.get(`${s.type}:${s.id}`);
    if (e) entities[e.key] = cardOf(e);
  }
  if (result.debug) {
    for (const d of result.debug) {
      const e = load.index.entities.get(d.key);
      if (e && !entities[d.key]) entities[d.key] = cardOf(e);
    }
    for (const r of result.rejected) {
      const e = load.index.entities.get(r.key);
      if (e && !entities[r.key]) entities[r.key] = cardOf(e);
    }
  }

  return {
    ok: true,
    result,
    entities,
    failed: [...load.failed, ...userLoad.failed],
    timings: { index: load.cached ? 0 : load.loadMs, build: load.cached ? 0 : load.buildMs, user: userLoad.ms, pipeline: pipelineMs, cachedIndex: load.cached },
  };
}

const computeCached = cache(compute);

export async function getRecommendations(req: Omit<RecommendationRequest, "userId">, viewerId: string | null): Promise<RecommendationView> {
  const key = JSON.stringify(req);
  if (!viewerId && !req.debug) {
    const hit = anonResults.get(key);
    if (hit && Date.now() - hit.at < TMR_V1.ANON_RESULT_TTL_SECONDS * 1000) {
      /* A fresh request id per serve, so events from two serves stay apart. */
      return hit.value.ok ? { ...hit.value, result: { ...hit.value.result, requestId: crypto.randomUUID() } } : hit.value;
    }
  }
  const value = await computeCached(key, viewerId);
  if (!viewerId && !req.debug && value.ok && value.failed.length === 0) {
    if (anonResults.size > 500) anonResults.delete(anonResults.keys().next().value!);
    anonResults.set(key, { at: Date.now(), value });
  }
  return value;
}

/*
  The Search tie-break's preference function (D181). Signed in only: a signed out
  search has no context to break a tie with, and is left exactly as ranked. Any
  failure returns null and Search runs as it always did; the engine can never
  take a search down.
*/
export async function searchPreference(viewerId: string | null, query: string): Promise<((key: string) => number) | null> {
  if (!viewerId) return null;
  try {
    const load = await getCatalogueIndex();
    const { user } = await userFor(viewerId, load.index.generation, false, load.index);
    if (user.cold) return null;
    const qv = load.index.lexical.queryVector(query);
    return (key: string) => contextPreference(key, load.index, user, qv.size ? qv : null);
  } catch (err) {
    console.error("[recommend] search tie-break unavailable", err);
    return null;
  }
}

/* The index itself, for pages that need entity facts beside recommendations
   (the model page) without a second catalogue read. */
export async function getCatalogueEntity(type: EntityType, slug: string): Promise<ToolModelEntity | null> {
  const load = await getCatalogueIndex();
  return load.index.bySlug.get(`${type}:${slug}`) ?? null;
}
