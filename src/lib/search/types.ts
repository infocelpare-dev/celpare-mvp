/*
  The shapes the search pipeline passes between its stages.

  Deliberately in their own module and free of any server import, so the pieces
  that run in the browser (the header, the suggestion list, the result cards) can
  share the same types as the pieces that run on the server.

  THE PIPELINE IS: retrieve -> extract features -> rank -> diversify -> page.
  Every stage takes and returns something named here, which is what lets the
  heuristic ranker be replaced by a learned one later without the pages changing.
*/

export type EntityType = "tool" | "model" | "person" | "post";

/* The tab the person is on. "all" is a blend, the rest are one entity each. */
export type SearchTab = "all" | "tools" | "models" | "people" | "posts";

export const SEARCH_TABS: SearchTab[] = ["all", "tools", "models", "people", "posts"];

export function isSearchTab(value: string | undefined): value is SearchTab {
  return typeof value === "string" && (SEARCH_TABS as string[]).includes(value);
}

/*
  What the query looks like it is asking for.

  Intent never FILTERS anything out. It reorders: a person intent puts people
  above tools, it does not hide the tools. Section 3 of the brief asks for
  irrelevant categories to be dropped, and "irrelevant" is decided by whether a
  tab has results, not by a guess at what was meant.
*/
export type Intent =
  | "entity"      /* a specific named thing: "Claude", "GitHub Copilot" */
  | "tool"        /* "AI video generator", "coding ai" */
  | "model"       /* "open source LLM", "gpt-4 context window" */
  | "person"      /* "@ameag", "machine learning engineers" */
  | "post"        /* "how did you", "anyone tried" */
  | "general";    /* nothing in the query says which */

export type ParsedQuery = {
  /* Exactly what was typed, trimmed. Shown back to the person. */
  raw: string;
  /* Lowercased, whitespace collapsed, capped at 200. The history key. */
  normalized: string;
  /* Words worth matching on, stop words removed. */
  terms: string[];
  /* Every word, stop words included. Length is a signal on its own: a six word
     query is a sentence, a one word query is a name. */
  allTerms: string[];
  intent: Intent;
  /* A handle was typed, with or without the @. */
  handle: string | null;
  /* What we think they meant, when what they typed matches nothing. Null unless
     a correction was actually found. */
  corrected: string | null;
  /* True when the last word looks half typed, so prefix matching matters more. */
  partial: boolean;
};

/* ---------------------------------------------------------------------------
   Candidates: what retrieval hands to ranking.
   Each mirrors one RPC's return row, in camelCase.
   --------------------------------------------------------------------------- */

/* The match signals every entity has, whatever it is. */
export type MatchSignals = {
  exact: boolean;
  prefix: boolean;
  nameSimilarity: number;
  phrase: boolean;
  tsRank: number;
  /* How many query terms the document contains, out of how many were asked. */
  termHits: number;
  termTotal: number;
  /* Which retrieval arms produced this candidate. Recorded, not scored. */
  sources: string[];
};

export type ToolCandidate = {
  type: "tool";
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  logoUrl: string | null;
  pricing: string | null;
  pricingModel: string | null;
  tags: string[];
  features: string[];
  platforms: string[];
  categories: string[];
  rating: number | null;
  ratingCount: number;
  likeCount: number;
  verified: boolean;
  createdAt: string;
  publishedAt: string | null;
  match: MatchSignals & {
    category: boolean;
    tag: boolean;
    feature: boolean;
    platform: boolean;
  };
  /* Filled by the engagement pass. Zeroes until then, never invented. */
  engagement: Engagement;
  behaviour: Behaviour;
};

export type ModelCandidate = {
  type: "model";
  id: string;
  slug: string;
  name: string;
  provider: string | null;
  description: string | null;
  contextWindow: number | null;
  inputPrice: number | null;
  outputPrice: number | null;
  modalities: string[];
  tags: string[];
  websiteUrl: string | null;
  createdAt: string;
  match: MatchSignals & { provider: boolean; tag: boolean; modality: boolean };
  engagement: Engagement;
  behaviour: Behaviour;
};

export type PersonCandidate = {
  type: "person";
  id: string;
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  isDeveloper: boolean;
  developerVerified: boolean;
  company: string | null;
  expertise: string[];
  skills: string[];
  interests: string[];
  followerCount: number;
  createdAt: string;
  match: MatchSignals & { skill: boolean; expertise: boolean; company: boolean };
  behaviour: Behaviour;
};

export type PostCandidate = {
  type: "post";
  id: string;
  authorId: string;
  createdAt: string;
  likeCount: number;
  commentCount: number;
  saveCount: number;
  match: MatchSignals;
  behaviour: Behaviour;
};

export type Candidate = ToolCandidate | ModelCandidate | PersonCandidate | PostCandidate;

/* Counts from search_engagement. All real, all aggregates. */
export type Engagement = {
  views30d: number;
  viewsTotal: number;
  saves: number;
  reviews: number;
  mentions: number;
};

export const NO_ENGAGEMENT: Engagement = {
  views30d: 0,
  viewsTotal: 0,
  saves: 0,
  reviews: 0,
  mentions: 0,
};

/* Counts from search_behaviour: what people did with this result for this query. */
export type Behaviour = {
  impressions: number;
  clicks: number;
  strong: number;
  avgPosition: number;
};

export const NO_BEHAVIOUR: Behaviour = {
  impressions: 0,
  clicks: 0,
  strong: 0,
  avgPosition: 0,
};

/* ---------------------------------------------------------------------------
   Scored results: what ranking hands to the page.
   --------------------------------------------------------------------------- */

/*
  Every component of the score, kept rather than collapsed.

  This is the feature vector, and it is the reason a learned ranker can be
  dropped in later: rankCandidates() consumes exactly this and nothing else.
  It is also what "show why it matched" on a result card reads.
*/
export type ScoreBreakdown = {
  relevance: number;
  semantic: number;
  quality: number;
  popularity: number;
  engagement: number;
  freshness: number;
  personalization: number;
  behaviour: number;
  penalty: number;
  total: number;
};

export type Scored<T extends Candidate = Candidate> = {
  candidate: T;
  score: ScoreBreakdown;
  /* The short human reason, for the card. "Exact match", "Matches AI Coding". */
  reason: string | null;
};

export type SearchResults = {
  query: ParsedQuery;
  tab: SearchTab;
  tools: Scored<ToolCandidate>[];
  models: Scored<ModelCandidate>[];
  people: Scored<PersonCandidate>[];
  posts: Scored<PostCandidate>[];
  /* The blended order for the All tab, already diversified. */
  all: Scored[];
  counts: Record<Exclude<SearchTab, "all">, number>;
  total: number;
  /*
    The viewer's own follow rows, so a person result can render a Follow button
    that already knows which way round it is rather than flickering.

    It is read as part of the affinity pass, which already needed it for
    personalization, so this costs no extra query. It is the viewer's own data
    and never anybody else's: loadAffinity has no way to ask about another
    account.
  */
  following: Set<string>;
  /* The search_events row this search was recorded as, so an impression or a
     click can be attributed to it. Null when telemetry is unavailable. */
  queryId: string | null;
  /* True when retrieval was capped, so the page can offer another page. */
  hasMore: boolean;
  /*
    Nothing matched closely. There ARE results, and they are shown, with the
    refinement advice above them. See WEIGHTS.WEAK_RESULT_RELEVANCE for the
    measurement behind the threshold.
  */
  weak: boolean;
};

export type Suggestion = {
  kind: "recent" | "tool" | "model" | "person" | "category" | "topic";
  label: string;
  sublabel: string | null;
  href: string;
};

export type RecentSearch = {
  query: string;
  normalized: string;
  searchedAt: string;
  resultCount: number;
};
