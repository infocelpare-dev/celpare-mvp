import { buildIndex, type CatalogueIndex } from "../catalogue";
import type { EntityInput } from "../entity";
import { recommend } from "../pipeline";
import type { RecommendationRequest, RecommendationResult } from "../types";
import { buildUserContext, emptyUserContext, type ActivityRow, type UserContext } from "../user";
import { TMR_CONTROL } from "../versions";
import { CATALOGUE_SNAPSHOT } from "./catalogue-snapshot";

/* The snapshot's clock: a day after it was taken, so "new" is stable. */
export const NOW = Date.parse("2026-09-29T12:00:00Z");

/* Search's listing quality needs rows the snapshot does not keep; tests use a
   plain stand in: verified and rated listings a little higher. */
export function snapshotInputs(): EntityInput[] {
  return CATALOGUE_SNAPSHOT.map((r) => ({
    ...r,
    listingQuality: 0.3 + (r.verified ? 0.2 : 0) + (r.ratingCount ? 0.1 : 0),
    listingPenalty: 0,
  }));
}

let cached: CatalogueIndex | null = null;
export function snapshotIndex(): CatalogueIndex {
  cached ??= buildIndex({ entities: snapshotInputs(), generation: "snapshot", now: NOW });
  return cached;
}

export function bySlug(index: CatalogueIndex, type: "tool" | "model", slug: string) {
  const e = index.bySlug.get(`${type}:${slug}`);
  if (!e) throw new Error(`no ${type} ${slug} in the snapshot`);
  return e;
}

export function run(req: Partial<RecommendationRequest> & Pick<RecommendationRequest, "strategy">, opts: { index?: CatalogueIndex; user?: UserContext } = {}): RecommendationResult {
  const index = opts.index ?? snapshotIndex();
  return recommend({
    request: { surface: "tool_profile", entityTypes: ["tool"], limit: 6, ...req },
    index,
    user: opts.user ?? emptyUserContext(null),
    now: NOW,
    requestId: "00000000-0000-4000-8000-000000000000",
    assignment: TMR_CONTROL,
  });
}

export function slugs(result: RecommendationResult, index: CatalogueIndex = snapshotIndex()): string[] {
  return result.items.map((i) => index.entities.get(i.key)!.slug);
}

export function userFrom(activity: Omit<ActivityRow, "at">[] & { at?: number }[], index: CatalogueIndex = snapshotIndex(), minutesApart = 2): UserContext {
  const rows = (activity as (Omit<ActivityRow, "at"> & { at?: number })[]).map((a, i) => ({ ...a, at: a.at ?? NOW - (activity.length - i) * minutesApart * 60_000 }));
  return buildUserContext({ userId: "user-1", activity: rows, now: NOW }, index);
}
