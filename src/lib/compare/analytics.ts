import "server-only";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";
import type { CompareEvent, CompareGoal } from "@/lib/compare/types";

/*
  Compare analytics.

  RECORDED FOR LATER, READ BY NOTHING NOW. These rows exist so the Compare
  Intelligence phase has history to learn from. No ranking, no recommendation
  and no ordering reads compare_events today, and none may until that phase
  decides how (brief section 49).

  SAME SHAPE AS SEARCH, FOR THE SAME REASON. A closed table with no client
  grant, written with the service role, from values computed or validated on the
  server. src/lib/search/analytics.ts carries the argument in full: an insert
  policy on an analytics table is an invitation to manufacture the numbers.

  WHAT IS STORED AND WHAT IS DERIVED. The brief lists pricing_section_viewed,
  features_section_viewed and benchmark_section_viewed. They are stored as one
  kind, section_viewed, with the section in its own column, because three event
  names for one action is three places for the definition to drift. A pricing
  view is `event = 'section_viewed' and section = 'pricing'`.

  goal_selected carries the goal that was CHOSEN in `section`, because the
  batch's `goal` column is the comparison's goal at the moment the event was
  queued, which is the one being replaced.

  `signature` is the comparison itself, the ordered item list as the URL carries
  it, so two views of the same comparison can be grouped without a comparisons
  table. It only ever holds public slugs.

  THE ENDPOINT IS PUBLIC AND THAT LIMIT IS RECORDED. As with search result events,
  a script can post events that did not happen. It cannot invent an event kind,
  write as another account or exceed the batch cap, and nothing ranks on these
  rows, so there is nothing to buy with them yet. A signed per view token is the
  fix when something starts reading them.
*/

function unavailable(): boolean {
  if (hasServiceRole()) return false;
  if (process.env.NODE_ENV !== "production") {
    console.warn("[compare] events not recorded: no SUPABASE_SERVICE_ROLE_KEY");
  }
  return true;
}

export async function recordCompareEvents(input: {
  userId: string | null;
  itemCount: number;
  goal: CompareGoal | null;
  signature: string | null;
  events: CompareEvent[];
}): Promise<void> {
  if (input.events.length === 0 || unavailable()) return;

  const rows = input.events.slice(0, 40).map((e) => ({
    user_id: input.userId,
    event: e.event,
    item_type: e.itemType && e.itemId ? e.itemType : null,
    item_id: e.itemType && e.itemId ? e.itemId : null,
    item_count: Math.max(0, Math.min(12, Math.trunc(input.itemCount))),
    position: typeof e.position === "number" ? Math.max(0, Math.min(11, Math.trunc(e.position))) : null,
    section: e.section ?? null,
    goal: input.goal,
    signature: input.signature ? input.signature.slice(0, 400) : null,
  }));

  try {
    const { error } = await createAdminClient().from("compare_events").insert(rows);
    if (error) console.error("[compare] events insert failed", error.code, error.message);
  } catch (err) {
    /* Telemetry never fails the request it describes. */
    console.error("[compare] events insert threw", err);
  }
}
