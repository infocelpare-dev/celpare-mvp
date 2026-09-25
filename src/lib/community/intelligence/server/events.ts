import "server-only";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";

/*
  Feed impressions, opens and dwell: the feed's half of the learning loop.

  THE SAME DESIGN AS lib/community/video-analytics.ts, deliberately, and for the
  same reasons. Written with the service role into a table with no client grant
  and no policy, so nobody can forge their own reach or dwell. The user id comes
  from the session in the route, never from the body. Every value is bounded
  here and again by a CHECK on the table.

  NOT A SECOND VIDEO SYSTEM. Inside the vertical viewer, post_video_events
  remains the only record. This covers posts shown in the feed, which had no
  impression record at all, and adds what the video table does not carry: the
  algorithm version, experiment variant and reason code that placed the post.

  FIRE AND FORGET. A failed write is logged and dropped; nothing a person sees
  waits on it.
*/

/* "serve" (feed_v3): the post was delivered to the browser, on screen or not. */
export const FEED_EVENTS = ["impression", "open", "dwell", "serve"] as const;
export type FeedEventKind = (typeof FEED_EVENTS)[number];

export const FEED_SURFACES = ["for_you", "following", "topic", "trending", "profile", "post"] as const;
export type FeedEventSurface = (typeof FEED_SURFACES)[number];

export type FeedEvent = {
  postId: string;
  event: FeedEventKind;
  position?: number | null;
  dwellMs?: number | null;
};

function clamp(n: number | null | undefined, min: number, max: number): number | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

/* The algorithm, variant and reason must match the table's CHECK patterns; a
   value that does not is dropped rather than failing the batch. */
const ALGORITHM = /^[a-z]+(_[a-z]+)*_v[0-9]+$/;
const VARIANT = /^[a-z0-9_]{1,40}$/;
const REASON = /^[a-z_]{1,40}$/;

function ok(v: string | null | undefined, re: RegExp): string | null {
  return v && re.test(v) ? v : null;
}

export async function recordFeedEvents(input: {
  userId: string | null;
  sessionId: string | null;
  surface: FeedEventSurface;
  algorithm: string | null;
  variant: string | null;
  events: (FeedEvent & { reason?: string | null })[];
}): Promise<void> {
  if (input.events.length === 0) return;
  if (!hasServiceRole()) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[feed] events not recorded: no SUPABASE_SERVICE_ROLE_KEY");
    }
    return;
  }

  const rows = input.events.slice(0, 60).map((e) => ({
    post_id: e.postId,
    user_id: input.userId,
    /* Only for somebody with no account, as the video events do. */
    session_id: input.userId ? null : input.sessionId,
    surface: input.surface,
    event: e.event,
    position: clamp(e.position, 0, 500),
    dwell_ms: e.event === "dwell" ? clamp(e.dwellMs, 0, 86_400_000) : null,
    algorithm: ok(input.algorithm, ALGORITHM),
    variant: ok(input.variant, VARIANT),
    reason: ok(e.reason ?? null, REASON),
  }));

  try {
    const { error } = await createAdminClient().from("feed_events").insert(rows);
    if (error) console.error("[feed] events failed", error.code, error.message);
  } catch (err) {
    console.error("[feed] events threw", err);
  }
}
