import "server-only";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";
import { normalizeQuery } from "./query";
import type { EntityType } from "./types";

/*
  Search analytics.

  WHICH EVENTS ARE STORED AND WHICH ARE DERIVED, because the brief lists eleven
  and this writes two kinds of row. The distinction is not a shortcut; a stored
  event that can be computed from another stored event is a second copy that can
  disagree with the first.

    search_submitted        a search_events row. Already existed.
    search_no_results       the same row with result_count = 0. There is even a
                            partial index for it, search_events_zero_idx.
    search_refinement       derived: the next search by the same account inside a
                            few minutes whose query extends the previous one.
                            Nothing new to store, and storing a flag would mean
                            deciding "a refinement" at write time and being stuck
                            with that definition.
    search_started          NOT recorded. It fires when a field is focused, it
                            carries no decision, and it would outnumber every
                            other row in the table by an order of magnitude.
    search_suggestion_clicked  recorded as the search it turns into: a suggestion
                            that navigates to a query becomes a search_events row
                            with source 'search', and one that goes straight to a
                            tool or a profile becomes a click on that result.
    impression, click, save, like, follow, share, outbound
                            search_result_events, one row each.

  WHY THE SERVICE ROLE. The same argument src/lib/telemetry.ts makes in full and
  this is the same shape of write: every value is computed server side, nothing is
  read back into a browser, and the alternative is an insert policy on the table
  the ranking signals are read from. Somebody could then manufacture ten thousand
  clicks on their own tool and buy themselves a position. Analytics nobody can
  forge is worth more than analytics that needs no key.

  A KNOWN LIMIT, WRITTEN DOWN RATHER THAN HIDDEN. The impression and click route
  is still a public endpoint: a script that holds a real query_id can post events
  that did not happen. What it cannot do is post them for a query it never ran, or
  for a position outside the range, or in unbounded volume, and the ranker caps
  what behaviour can be worth in the first place (BEHAVIOUR_MIN_IMPRESSIONS and
  the position surplus). Closing it properly needs a signed, single use token per
  result list. Recorded as a gap.
*/

function unavailable(): boolean {
  if (hasServiceRole()) return false;
  if (process.env.NODE_ENV !== "production") {
    console.warn("[search] events not recorded: no SUPABASE_SERVICE_ROLE_KEY");
  }
  return true;
}

export type ResultEventKind =
  | "impression"
  | "click"
  | "save"
  | "like"
  | "follow"
  | "share"
  | "outbound";

export type ResultEvent = {
  resultType: EntityType;
  resultId: string;
  position: number;
  event: ResultEventKind;
};

/*
  A batch, because impressions arrive in tens and one round trip is the whole
  point. Capped at 60 rows per call: a page shows at most a few dozen results, so
  anything larger is not a page of impressions.
*/
export async function recordResultEvents(input: {
  queryId: string | null;
  query: string;
  userId: string | null;
  events: ResultEvent[];
}): Promise<void> {
  const normalized = normalizeQuery(input.query);
  if (!normalized || input.events.length === 0) return;
  if (unavailable()) return;

  const rows = input.events.slice(0, 60).map((e) => ({
    query_id: input.queryId,
    user_id: input.userId,
    normalized,
    result_type: e.resultType,
    result_id: e.resultId,
    /* Clamped rather than rejected. A position outside the range is a bug in the
       caller, and losing the whole batch over one row would lose the good ones. */
    position: Math.max(0, Math.min(200, Math.trunc(e.position))),
    event: e.event,
  }));

  try {
    const { error } = await createAdminClient()
      .from("search_result_events")
      .insert(rows);
    if (error) {
      console.error("[search] result events failed", error.code, error.message);
    }
  } catch (err) {
    console.error("[search] result events threw", err);
  }
}
