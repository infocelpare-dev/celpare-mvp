import "server-only";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";

/*
  Watch signals for video posts.

  THESE ARE NOT USED FOR RANKING AND NOTHING READS THEM YET. That is deliberate:
  the brief builds the player now and the recommendation system later, and the
  one thing that cannot be added retroactively is the history. A ranker shipped
  in three months with three months of watch data behind it is a different thing
  from one shipped with none.

  WHY THE SERVICE ROLE, the same argument src/lib/search/analytics.ts makes. Watch
  time is the single most valuable ranking signal a video feed has, which makes it
  the single most valuable thing to forge. An insert policy on this table would let
  anybody write themselves ten thousand completions. The table has no policies and
  no grant to anon or authenticated at all, so the only way in is this module.

  WHICH SIGNALS ARE STORED AND WHICH ARE DERIVED. The brief lists seventeen; this
  writes rows for the ones that are decisions and carries the rest as measures on
  those rows.

    impression        the video scrolled into the active position
    started           playback began for the first time
    paused / resumed  a real pause, not a scroll away
    completed         playback reached the end
    progress          a milestone crossed, carrying percent_watched
    swipe_next        moved forward, carrying how much of the last one was watched
    swipe_previous    moved back
    like, save, share, repost, report, not_interested,
    comment_opened, profile_opened, follow
                      the actions, each recorded where it happens

    watch duration    NOT an event. A measure on every row, because "watched
    percentage watched  40 seconds" is meaningless without saying of what and
                      when, and a row that already says when can carry it.

  THE LIMIT THAT REMAINS, written down rather than assumed. The route is public,
  so a script can post events that did not happen. It cannot write as another
  account (the user id comes from the session, never the body), invent an event
  kind, or exceed the bounds the CHECK constraints set. Closing it properly needs
  a signed single use token minted with each list, which is the same gap the
  search events route carries and is best fixed once for both.
*/

function unavailable(): boolean {
  if (hasServiceRole()) return false;
  if (process.env.NODE_ENV !== "production") {
    console.warn("[video] events not recorded: no SUPABASE_SERVICE_ROLE_KEY");
  }
  return true;
}

export const VIDEO_EVENTS = [
  "impression",
  "started",
  "paused",
  "resumed",
  "completed",
  "progress",
  "swipe_next",
  "swipe_previous",
  "like",
  "comment_opened",
  "share",
  "save",
  "report",
  "not_interested",
  "repost",
  "profile_opened",
  "follow",
] as const;

export type VideoEventKind = (typeof VIDEO_EVENTS)[number];

export const VIDEO_SOURCES = [
  "feed",
  "video",
  "following",
  "explore",
  "profile",
] as const;

export type VideoSource = (typeof VIDEO_SOURCES)[number];

export type VideoEvent = {
  postId: string;
  event: VideoEventKind;
  position?: number | null;
  watchMs?: number | null;
  percentWatched?: number | null;
  durationMs?: number | null;
};

/* Every bound here is also a CHECK on the table. Clamping rather than rejecting,
   for the reason the search batch gives: a bad value is a bug in the caller, and
   throwing the whole batch away over one row loses the good ones with it. */
function clamp(n: number | null | undefined, min: number, max: number): number | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

/*
  A batch, because these arrive in handfuls: an impression, a start and a progress
  milestone can all happen inside one second of watching. Capped at 40 rows, which
  is more than a sitting produces between flushes and far less than a script would
  want.
*/
export async function recordVideoEvents(input: {
  userId: string | null;
  sessionId: string | null;
  source: VideoSource;
  events: VideoEvent[];
}): Promise<void> {
  if (input.events.length === 0) return;
  if (unavailable()) return;

  const rows = input.events.slice(0, 40).map((e) => ({
    post_id: e.postId,
    user_id: input.userId,
    /* Only ever recorded for somebody with no account. Attaching it to a signed
       in person would build a second identifier beside the one that already
       exists, which is a tracking surface nothing here needs. */
    session_id: input.userId ? null : input.sessionId,
    event: e.event,
    position: clamp(e.position, 0, 500),
    watch_ms: clamp(e.watchMs, 0, 86_400_000),
    percent_watched: clamp(e.percentWatched, 0, 100),
    duration_ms: clamp(e.durationMs, 0, 86_400_000),
    source: input.source,
  }));

  try {
    const { error } = await createAdminClient()
      .from("post_video_events")
      .insert(rows);
    if (error) {
      console.error("[video] events failed", error.code, error.message);
    }
  } catch (err) {
    console.error("[video] events threw", err);
  }
}
