import type { FreshnessClass } from "./types";

/*
  Every threshold compare_v1 uses, in one file. None of them is a claim about any
  product; each is a presentation or data hygiene rule, stated here so changing
  one never means opening a stage.
*/

export const COMPARE_V1 = {
  /* The engine's own ceiling. The page shows 6 per tab (MAX_ITEMS); the save RPC takes 12. */
  maxEntities: 12,

  /* Days after which a value of each class is drawn as older data. Price keeps the
     90 days Compare has used since 4AT (STALE_AFTER_DAYS). Identity never goes stale. */
  staleAfterDays: {
    price: 90,
    performance: 30,
    benchmark: 365,
    fact: 365,
    identity: null,
  } satisfies Record<FreshnessClass, number | null>,

  /* A value younger than this share of its threshold is fresh, older is aging. */
  freshShare: 0.5,

  /* Two numbers closer than this share are treated as equal in fit and wording. */
  equalWithin: 0.05,

  /* Fit: the favourable and unfavourable share of the known range. */
  strengthAt: 0.75,
  tradeoffAt: 0.25,

  /* At most this many reasons per list per entity; the rest are in debug. */
  maxReasons: 5,

  /* Data hygiene. An input price above this per 1M tokens is flagged, not dropped. */
  implausiblePricePerM: 1000,
  maxContextTokens: 100_000_000,

  /* Pareto needs this many entities with both values before a chart means anything. */
  paretoMinPoints: 3,

  /* Summary: at most this many fact and derived lines before the interpretation. */
  summaryLines: 6,
} as const;

/*
  Caching (D170). Every comparison set holds prices, so a set's TTL is the price
  TTL: the per class TTLs collapse to one for the set key, and are kept here so a
  later per class cache can use them.

  Redis stays OFF until 4BJ.27 measures it cheaper than the two read waves it
  would replace. The in process cache is on: public data, one short window.
*/
export const COMPARE_CACHE = {
  ttlSeconds: { identity: 86_400, price: 900, performance: 900, benchmark: 21_600 },
  setTtlSeconds: 900,
  memoryTtlSeconds: 60,
  redis: false,
} as const;
