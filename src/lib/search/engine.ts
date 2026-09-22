import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { recordSearch } from "@/lib/telemetry";
import { POST_SELECT, normalisePost, type FeedPost } from "@/lib/community/queries";
import { parseQuery, retrievalQuery } from "./query";
import { loadAffinity } from "./personalization";
import {
  loadBehaviour,
  loadEngagement,
  readerFor,
  retrieveAll,
} from "./retrieval";
import { NO_AFFINITY, rankCandidates, WEIGHTS, type RankContext } from "./ranking";
import { diversify, interleave } from "./diversity";
import {
  isSearchTab,
  type ModelCandidate,
  type ParsedQuery,
  type PersonCandidate,
  type PostCandidate,
  type SearchResults,
  type SearchTab,
  type Scored,
  type ToolCandidate,
} from "./types";

/*
  The pipeline, and the only thing a page calls.

    parse -> retrieve (parallel) -> engagement and behaviour (parallel)
          -> rank -> diversify -> page

  Each stage is a named function in its own file, which is the interface section
  24 asks for: retrieveCandidates, extractFeatures, rankCandidates,
  diversifyResults, returnResults. Replacing the heuristic ranker with a learned
  one means replacing rankCandidates and nothing else. Retrieval does not know how
  results are scored and the pages do not know either.

  NOTHING IS RANKED IN THE BROWSER. This module is server only and the pages that
  call it are server components, the same arrangement the feed uses.
*/

export type SearchInput = {
  query: string;
  tab?: string;
  page?: number;
  signedIn: boolean;
  viewerId: string | null;
  /* The page records the search itself unless this is false, which is what the
     suggestion endpoint passes: a keystroke is not a search. */
  record?: boolean;
};

const EMPTY_COUNTS = { tools: 0, models: 0, people: 0, posts: 0 } as const;

function emptyResults(parsed: ParsedQuery, tab: SearchTab): SearchResults {
  return {
    query: parsed,
    tab,
    tools: [],
    models: [],
    people: [],
    posts: [],
    all: [],
    counts: { ...EMPTY_COUNTS },
    following: new Set<string>(),
    weak: false,
    total: 0,
    queryId: null,
    hasMore: false,
  };
}

export async function runSearch(input: SearchInput): Promise<SearchResults> {
  const parsed = parseQuery(input.query);
  const tab: SearchTab = isSearchTab(input.tab) ? input.tab : "all";

  if (!parsed.normalized) return emptyResults(parsed, tab);

  const db = await readerFor(input.signedIn);

  /*
    Retrieval and the viewer's affinity in parallel. The affinity read uses the
    caller's own session client, which is a different client from the one
    retrieval may be using: a signed out search reads the catalogue as anon and
    has no affinity to read at all.
  */
  const [raw, affinity] = await Promise.all([
    retrieveAll(db, retrievalQuery(parsed)),
    input.viewerId
      ? loadAffinity(await createClient(), input.viewerId)
      : Promise.resolve(NO_AFFINITY),
  ]);

  /*
    The feature pass. Six reads, all issued together, none depending on another.
    Behaviour is keyed on the NORMALISED query, so "Video Editor" and
    "video editor" share what was learned rather than each learning it alone.
  */
  const toolIds = raw.tools.map((t) => t.id);
  const modelIds = raw.models.map((m) => m.id);
  const personIds = raw.people.map((p) => p.id);
  const postIds = raw.posts.map((p) => p.id);

  const [
    toolEngagement,
    modelEngagement,
    toolBehaviour,
    modelBehaviour,
    personBehaviour,
    postBehaviour,
  ] = await Promise.all([
    loadEngagement(db, "tool", toolIds),
    loadEngagement(db, "model", modelIds),
    loadBehaviour(db, parsed.normalized, "tool", toolIds),
    loadBehaviour(db, parsed.normalized, "model", modelIds),
    loadBehaviour(db, parsed.normalized, "person", personIds),
    loadBehaviour(db, parsed.normalized, "post", postIds),
  ]);

  for (const t of raw.tools) {
    t.engagement = toolEngagement.get(t.id) ?? t.engagement;
    t.behaviour = toolBehaviour.get(t.id) ?? t.behaviour;
  }
  for (const m of raw.models) {
    m.engagement = modelEngagement.get(m.id) ?? m.engagement;
    m.behaviour = modelBehaviour.get(m.id) ?? m.behaviour;
  }
  for (const p of raw.people) {
    p.behaviour = personBehaviour.get(p.id) ?? p.behaviour;
  }
  for (const p of raw.posts) {
    p.behaviour = postBehaviour.get(p.id) ?? p.behaviour;
  }

  /*
    EVERY ARM FAILED, so there is nothing to report and nothing to conclude.

    Raising sends the page to error.tsx, which says the search did not run and
    offers to try again, and Sentry gets the exception. The alternative is the
    zero result page, which states that nothing in the catalogue matched: a claim
    about the data, made at the moment the data could not be read. Measured in
    development, when the connection to Supabase dropped and all four arms plus
    an unrelated settings read failed together with "TypeError: fetch failed",
    and the page cheerfully answered 200 with "No results".
  */
  if (!raw.ok) {
    throw new Error("Search retrieval failed: no arm answered");
  }

  const ctx: RankContext = { parsed, affinity, now: Date.now() };

  /* Rank inside each type, then diversify inside each type. Cross type ordering
     happens in interleave, because a score is only roughly comparable across
     entity kinds and pretending otherwise lets one type fill the page. */
  const tools = diversify(rankCandidates<ToolCandidate>(raw.tools, ctx));
  const models = diversify(rankCandidates<ModelCandidate>(raw.models, ctx), {
    maxRun: WEIGHTS.MAX_PER_PROVIDER_RUN,
  });
  const people = rankCandidates<PersonCandidate>(raw.people, ctx);
  const posts = diversify(rankCandidates<PostCandidate>(raw.posts, ctx));

  const counts = {
    tools: tools.length,
    models: models.length,
    people: people.length,
    posts: posts.length,
  };
  const total = counts.tools + counts.models + counts.people + counts.posts;

  /*
    THE SEARCH IS RECORDED AFTER IT RAN, never before.

    result_count is the whole value of the row: a zero result search is the most
    useful thing in that table, and it cannot be known until the pipeline has
    finished. Awaited rather than fire and forget, because the id it returns is
    what an impression is attributed to. It still cannot fail the search: it
    returns null when the service role key is absent.
  */
  const queryId =
    input.record === false
      ? null
      : await recordSearch({
          query: parsed.raw,
          resultCount: total,
          userId: input.viewerId,
          source: "search",
        });

  /*
    Was anything a real match? The best relevance in the whole pool, back on the
    0..1 scale the weights multiply. Computed over every type rather than per tab,
    because the answer is about the QUERY and must not change when a tab is
    opened.
  */
  const bestRelevance = [...tools, ...models, ...people, ...posts].reduce(
    (best, s) => Math.max(best, s.score.relevance / WEIGHTS.RELEVANCE),
    0,
  );

  const orderedForAll = interleave(
    orderGroupsByIntent(parsed, { tools, models, people, posts }),
  );

  return {
    query: parsed,
    tab,
    tools,
    models,
    people,
    posts,
    all: orderedForAll,
    counts,
    total,
    following: affinity.following,
    queryId,
    weak: total > 0 && bestRelevance < WEIGHTS.WEAK_RESULT_RELEVANCE,
    hasMore:
      tools.length >= WEIGHTS.TOOL_POOL ||
      models.length >= WEIGHTS.MODEL_POOL ||
      people.length >= WEIGHTS.PEOPLE_POOL,
  };
}

/*
  Which group leads the All tab.

  Intent decides the ORDER OF THE GROUPS, and the score decides the order inside
  them. A person intent puts people first and still shows every tool underneath,
  which is the difference between reordering and filtering that the brief insists
  on and that a wrong intent guess makes cheap.
*/
function orderGroupsByIntent(
  parsed: ParsedQuery,
  groups: {
    tools: Scored<ToolCandidate>[];
    models: Scored<ModelCandidate>[];
    people: Scored<PersonCandidate>[];
    posts: Scored<PostCandidate>[];
  },
): Scored[][] {
  const { tools, models, people, posts } = groups;

  switch (parsed.intent) {
    case "person":
      return [people, tools, models, posts];
    case "model":
      return [models, tools, people, posts];
    case "post":
      return [posts, tools, models, people];
    case "tool":
    case "entity":
    case "general":
    default:
      return [tools, models, people, posts];
  }
}

/* ---------------------------------------------------------------------------
   Posts need their real rows.
   --------------------------------------------------------------------------- */

/*
  Post candidates carry ids and signals, not content.

  They are hydrated through POST_SELECT, the SAME projection the feed uses, so a
  post in a search result is the post from the feed with its author, topic,
  attached tool, attached model and media. 4AK.3 is the precedent and the reason:
  the profile had its own stripped copy of a post for months, and a video post
  rendered as a line of text.

  RLS is evaluated twice as a result, once by the candidate function and once
  here, and profile_shares() comes along for free both times.
*/
export async function hydratePosts(
  db: SupabaseClient,
  ids: string[],
): Promise<Map<string, FeedPost>> {
  const out = new Map<string, FeedPost>();
  if (ids.length === 0) return out;

  const { data, error } = await db
    .from("posts")
    .select(POST_SELECT)
    .in("id", ids.slice(0, 50))
    .eq("status", "visible")
    .is("deleted_at", null);

  if (error) {
    console.error("[search] post hydrate failed", error.code, error.message);
    return out;
  }

  for (const row of (data as unknown as FeedPost[]) ?? []) {
    out.set(row.id, normalisePost(row));
  }
  return out;
}
