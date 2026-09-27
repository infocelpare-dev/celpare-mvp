import "server-only";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";
import { recordFeedEvents, type FeedEventKind } from "@/lib/community/intelligence/server/events";
import { EXPLORE_ALGORITHM } from "../versions";

/*
  Explore events (D151). Posts and videos go to feed_events with surface
  "explore", so an Explore view is a view like any other (D129) and feeds the
  post lifecycle. Everything else goes to recommendation_events. Both tables
  are written with the service role only; the user id comes from the session in
  the route, never from the body. Fire and forget: a failed write is logged.
*/

export const EXPLORE_EVENTS = ["impression", "click", "save", "dismiss", "follow", "share", "play", "complete"] as const;
export type ExploreEventKind = (typeof EXPLORE_EVENTS)[number];

export const EXPLORE_EVENT_TYPES = ["tool", "model", "post", "video", "person", "topic", "category"] as const;

export type ExploreEvent = {
  entityType: (typeof EXPLORE_EVENT_TYPES)[number];
  /* A uuid, or a slug for a category. */
  entityId: string;
  event: ExploreEventKind;
  section: string | null;
  position: number | null;
  reason: string | null;
  source: string | null;
};

/* Post events in the feed table's vocabulary. Completion inside the vertical
   viewer is recorded by the viewer itself, so it is not duplicated here. */
const AS_FEED: Partial<Record<ExploreEventKind, FeedEventKind>> = {
  impression: "impression",
  click: "open",
  share: "share",
  play: "media_open",
  dismiss: "hide",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9-]{1,80}$/;
const SECTION = /^[a-z-]{1,40}$/;
const REASON = /^[a-z_]{1,40}$/;

export async function recordExploreEvents(input: {
  userId: string | null;
  sessionId: string | null;
  variant: string | null;
  events: ExploreEvent[];
}): Promise<void> {
  const events = input.events.slice(0, 60);
  if (events.length === 0) return;

  const posts = events.filter((e) => (e.entityType === "post" || e.entityType === "video") && UUID.test(e.entityId));
  const feed = posts.flatMap((e) => {
    const kind = AS_FEED[e.event];
    return kind ? [{ postId: e.entityId, event: kind, position: e.position, reason: e.reason }] : [];
  });
  const writes: Promise<void>[] = [];
  if (feed.length) {
    writes.push(
      recordFeedEvents({
        userId: input.userId,
        sessionId: input.sessionId,
        surface: "explore",
        algorithm: EXPLORE_ALGORITHM,
        variant: input.variant,
        events: feed,
      }),
    );
  }

  const others = events.filter((e) => e.entityType !== "post" && e.entityType !== "video");
  if (others.length && hasServiceRole()) {
    const rows = others.flatMap((e) => {
      const isCategory = e.entityType === "category";
      if (isCategory ? !SLUG.test(e.entityId) : !UUID.test(e.entityId)) return [];
      return [
        {
          user_id: input.userId,
          tool_id: e.entityType === "tool" ? e.entityId : null,
          surface: "explore",
          candidate_source: e.source && REASON.test(e.source) ? e.source : null,
          event: e.event,
          position: e.position === null ? null : Math.max(0, Math.min(500, Math.trunc(e.position))),
          entity_type: e.entityType,
          entity_id: isCategory ? null : e.entityId,
          entity_key: isCategory ? e.entityId : null,
          section: e.section && SECTION.test(e.section) ? e.section : null,
          algorithm: EXPLORE_ALGORITHM,
          variant: input.variant && /^[a-z0-9_]{1,40}$/.test(input.variant) ? input.variant : null,
          reason: e.reason && REASON.test(e.reason) ? e.reason : null,
          /* Only for somebody with no account, as the feed does. */
          session_id: input.userId ? null : input.sessionId,
        },
      ];
    });
    if (rows.length) {
      writes.push(
        (async () => {
          try {
            const { error } = await createAdminClient().from("recommendation_events").insert(rows);
            if (error) console.error("[explore] events failed", error.code, error.message);
          } catch (err) {
            console.error("[explore] events threw", err);
          }
        })(),
      );
    }
  }
  await Promise.all(writes);
}
