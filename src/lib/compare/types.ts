/*
  The shapes Compare passes between the server, the page and the browser.

  Free of any server import, so the builder, the selector and the tracking
  component share one definition with the loader rather than each describing the
  same row.

  THE CONTRACT FOR LATER. `ComparisonContext` is what the Compare Intelligence
  phase will consume, and `Recommendation` is what it will hand back. Both exist
  now so the page can be written against them, and NOTHING PRODUCES A
  RECOMMENDATION YET. The page renders the slot only when one is present, which
  today is never. No stand in, per D108.
*/

export type CompareItemType = "tool" | "model";

/* What the URL carries: a type and a slug, in the order the person chose. */
export type CompareRef = { type: CompareItemType; slug: string };

/*
  Two is the floor, because one item is not a comparison.

  SIX IS THE CEILING, AND IT COMES FROM THE LAYOUT RATHER THAN FROM TASTE. The
  page content is 1140px wide (Container). A label column of 176px leaves 964px,
  and six value columns of 160px is the most that still fits a price, a plan
  name or a three word label without truncating at desktop width. A seventh
  column would scroll sideways on a 1440 screen, which is the one place a
  comparison should never need to. On a phone the table scrolls whatever the
  count, so the ceiling is set by the wide case. The save RPC accepts up to 12,
  so raising this later is a one line change here and nowhere else.
*/
export const MIN_ITEMS = 2;
export const MAX_ITEMS = 6;

export type CompareGoal =
  | "coding"
  | "research"
  | "writing"
  | "image"
  | "video"
  | "business"
  | "agents"
  | "api"
  | "personal";

export const GOALS: { key: CompareGoal; label: string }[] = [
  { key: "coding", label: "Coding" },
  { key: "research", label: "Research" },
  { key: "writing", label: "Writing" },
  { key: "image", label: "Image generation" },
  { key: "video", label: "Video generation" },
  { key: "business", label: "Business" },
  { key: "agents", label: "Agents" },
  { key: "api", label: "API development" },
  { key: "personal", label: "Personal use" },
];

export function isGoal(value: string | null | undefined): value is CompareGoal {
  return GOALS.some((g) => g.key === value);
}

/* ---------------------------------------------------------------------------
   Provenance. Every value that can go stale carries one.
   --------------------------------------------------------------------------- */

export type Provenance = {
  /* "Official pricing page", "Provider model card". Null when not recorded. */
  label: string | null;
  url: string | null;
  /* Set only when somebody actually checked it. Never defaulted to a created_at:
     a row existing is not a row being verified. */
  verifiedAt: string | null;
};

/* ---------------------------------------------------------------------------
   Evidence rows
   --------------------------------------------------------------------------- */

export type AttributeSection =
  | "identity"
  | "capabilities"
  | "integrations"
  | "deployment"
  | "technical"
  | "privacy"
  | "use_cases"
  | "strengths"
  | "limitations";

export type AttributeValueType = "flag" | "text" | "number" | "fit" | "list";

export type Attribute = {
  key: string;
  section: AttributeSection;
  appliesTo: CompareItemType[];
  valueType: AttributeValueType;
  label: string;
  unit: string | null;
  sortOrder: number;
};

export type Fact = {
  id: string;
  attribute: string;
  flag: boolean | null;
  text: string | null;
  number: number | null;
  note: string | null;
  provenance: Provenance;
};

export type Plan = {
  id: string;
  name: string;
  tier: "free" | "individual" | "team" | "business" | "enterprise" | "usage" | "other";
  price: number | null;
  annualPrice: number | null;
  currency: string | null;
  period: "month" | "year" | "one_time" | "usage" | "custom" | null;
  perSeat: boolean;
  trialDays: number | null;
  limits: string | null;
  provenance: Provenance;
};

export type Evaluation = {
  id: string;
  kind: "benchmark" | "human_preference";
  domain: string;
  name: string;
  metric: string;
  score: number;
  unit: "percent" | "score" | "rating" | "other";
  higherIsBetter: boolean;
  ciLow: number | null;
  ciHigh: number | null;
  modelVersion: string | null;
  harness: string | null;
  evaluator: string;
  datasetVersion: string | null;
  evaluatedAt: string;
  /* "With tools", "partial", an effort level, a standard error: whatever the
     source printed beside the number, because the number means less without it. */
  note: string | null;
  benchmarkSlug: string | null;
  provenance: Provenance;
};

/* What a benchmark is. One row per benchmark, read by Compare and by Ask
   Celpare, so both explain it the same way. */
export type BenchmarkInfo = {
  slug: string;
  name: string;
  domain: string;
  category: string;
  measures: string;
  howToRead: string;
  useCases: CompareGoal[];
  provenance: Provenance;
};

/* ---------------------------------------------------------------------------
   Items
   --------------------------------------------------------------------------- */

type ItemBase = {
  id: string;
  slug: string;
  name: string;
  /* The public URL on Celpare. A model has no page yet, so it is null there and
     the header links the provider site instead. */
  href: string | null;
  websiteUrl: string | null;
  description: string | null;
  facts: Fact[];
  /* When the catalogue row itself last changed. A listing date, NOT a
     verification date, and labelled as one everywhere it appears. */
  listedUpdatedAt: string | null;
};

export type ToolItem = ItemBase & {
  type: "tool";
  tagline: string | null;
  logoUrl: string | null;
  categories: string[];
  pricingSummary: string | null;
  pricingModel: string | null;
  features: string[];
  platforms: string[];
  verified: boolean;
  rating: number | null;
  ratingCount: number;
  ratingBreakdown: Record<1 | 2 | 3 | 4 | 5, number> | null;
  latestReviewAt: string | null;
  inCatalogueSince: string | null;
  plans: Plan[];
};

export type ModelItem = ItemBase & {
  type: "model";
  provider: string | null;
  family: string | null;
  version: string | null;
  apiModelId: string | null;
  releaseDate: string | null;
  lifecycle: "preview" | "generally_available" | "deprecated" | "retired" | null;
  openWeights: boolean | null;
  contextWindow: number | null;
  maxOutputTokens: number | null;
  modalities: string[];
  outputModalities: string[];
  prices: {
    input: number | null;
    cachedInput: number | null;
    cacheWrite: number | null;
    output: number | null;
    batchInput: number | null;
    batchOutput: number | null;
    note: string | null;
    provenance: Provenance;
  };
  evaluations: Evaluation[];
};

export type CompareItem = ToolItem | ModelItem;

/*
  One slot per ref in the URL, in URL order. An item that cannot be shown keeps
  its slot and says why, so a stale share link degrades to "one of these is gone"
  rather than to an error page.
*/
export type CompareSlot =
  | { status: "ok"; ref: CompareRef; item: CompareItem }
  | { status: "unavailable"; ref: CompareRef; reason: "not_found" | "failed" };

/* Which evidence reads succeeded. A failed read is reported where its section
   would be, and the rest of the page stays (D109). */
export type EvidenceHealth = {
  facts: boolean;
  plans: boolean;
  evaluations: boolean;
  reviews: boolean;
};

export type Comparison = {
  slots: CompareSlot[];
  attributes: Attribute[];
  benchmarks: BenchmarkInfo[];
  health: EvidenceHealth;
  /* When the data was read. The one clock every freshness line is measured
     against, taken in the loader because a render must stay pure. */
  readAt: number;
};

/* ---------------------------------------------------------------------------
   The future intelligence contract. Prepared, not implemented.
   --------------------------------------------------------------------------- */

/* Everything a later analysis step would need, assembled from what the page
   already loads. Nothing reads this yet. */
export type ComparisonContext = {
  items: CompareItem[];
  attributes: Attribute[];
  goal: CompareGoal | null;
  viewer: { signedIn: boolean };
};

/*
  What a later step may return. A recommendation is always relative to a stated
  goal and is labelled as such, never as a universal winner.
*/
export type Recommendation = {
  itemId: string;
  goal: CompareGoal;
  reason: string;
  confidence?: number;
  evidence?: Provenance[];
};

/* ---------------------------------------------------------------------------
   The selector
   --------------------------------------------------------------------------- */

export type OptionRow = {
  type: CompareItemType;
  id: string;
  slug: string;
  name: string;
  sublabel: string | null;
  logoUrl: string | null;
};

export type OptionGroups = {
  results: OptionRow[];
  recent: OptionRow[];
  saved: OptionRow[];
  suggestedTools: OptionRow[];
  suggestedModels: OptionRow[];
  categories: { slug: string; name: string }[];
  /* Set when a search arm failed, so the list can say so instead of "no match". */
  degraded: boolean;
};

/* ---------------------------------------------------------------------------
   Analytics
   --------------------------------------------------------------------------- */

export const COMPARE_EVENTS = [
  "comparison_started",
  "comparison_viewed",
  "comparison_completed",
  "comparison_abandoned",
  "item_added",
  "item_removed",
  "item_reordered",
  "section_viewed",
  "source_opened",
  "tool_opened_from_comparison",
  "model_opened_from_comparison",
  "save_comparison",
  "share_comparison",
  "add_to_collection",
  "ask_celpare_from_comparison",
  "goal_selected",
] as const;

export type CompareEventKind = (typeof COMPARE_EVENTS)[number];

export type CompareEvent = {
  event: CompareEventKind;
  itemType?: CompareItemType;
  itemId?: string;
  position?: number;
  section?: string;
};
