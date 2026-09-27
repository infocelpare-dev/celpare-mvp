"use server";

import { z } from "zod";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { setFeedFeedback } from "@/app/actions/feed";
import { recordExploreEvents, EXPLORE_EVENT_TYPES } from "@/lib/explore/intelligence/server/events";

/*
  Not interested, from an Explore card (4BI).

  A post uses the feed's own not interested (feed_feedback), so the feed and
  Explore agree about it; the Explore event is recorded beside it as a hide.
  Any other entity is recorded as a dismiss in recommendation_events, which the
  next Explore request reads through my_explore_history: the item is held back
  while the dismiss is recent and its taxonomy weighs a little less, with decay,
  so one tap never removes a topic for good.

  Signed in only. The user id is the session's, never an argument.
*/

const schema = z.object({
  entityType: z.enum(EXPLORE_EVENT_TYPES),
  entityId: z.string().min(1).max(80),
  section: z.string().max(40).nullable(),
  position: z.number().int().min(0).max(500).nullable(),
});

export async function dismissExploreItem(input: z.infer<typeof schema>): Promise<{ ok: boolean; message: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "That could not be hidden." };
  if (!isSupabaseConfigured()) return { ok: false, message: "Explore is not connected." };

  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return { ok: false, message: "Sign in to tune Explore." };

  const { entityType, entityId, section, position } = parsed.data;
  if (entityType === "post" || entityType === "video") {
    const res = await setFeedFeedback({ targetType: "post", targetId: entityId });
    if (!res.ok) return { ok: false, message: res.message };
  }

  await recordExploreEvents({
    userId: user.id,
    sessionId: null,
    variant: null,
    events: [{ entityType, entityId, event: "dismiss", section, position, reason: null, source: null }],
  });
  return { ok: true, message: "Hidden. Explore will show less like this." };
}
