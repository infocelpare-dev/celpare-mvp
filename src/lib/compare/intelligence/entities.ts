import type { CompareItem } from "../types";
import type { ComparisonEntity } from "./types";

/*
  Entity normalisation (guide 16 section 5). A comparison entity is a view over
  the row loadComparison already read: nothing is re-read, nothing is copied to a
  table, and the loaded item rides along for the strategies to read from.
*/

export function toEntity(item: CompareItem): ComparisonEntity {
  return {
    id: item.id,
    type: item.type,
    name: item.name,
    slug: item.slug,
    provider: item.type === "model" ? item.provider : null,
    item,
    updatedAt: item.listedUpdatedAt,
  };
}

/* Entities in the request's display order. An id the input does not hold is
   left out here and reported by the caller as unavailable. */
export function resolveEntities(order: { type: string; id: string }[], items: CompareItem[]): ComparisonEntity[] {
  const byKey = new Map(items.map((i) => [`${i.type}:${i.id}`, i]));
  return order.flatMap((r) => {
    const item = byKey.get(`${r.type}:${r.id}`);
    return item ? [toEntity(item)] : [];
  });
}
