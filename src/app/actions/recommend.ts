"use server";

import { z } from "zod";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { recordRecommendationEvents } from "@/lib/recommend/server/events";
import { SURFACES, STRATEGIES } from "@/lib/recommend/types";

/*
  Not interested, from a tool or model recommendation card (4BK, D184).

  Recorded as not_interested in recommendation_events. The next request reads it
  through my_tool_model_activity: the entry is held back, and its category and
  use cases weigh a little less, with a 30 day half life, so one tap never
  removes a whole kind of tool for good.

  Signed in only. The user id is the session's, never an argument.
*/

const schema = z.object({
  entityType: z.enum(["tool", "model"]),
  entityId: z.string().uuid(),
  surface: z.enum(SURFACES as [string, ...string[]]),
  strategy: z.enum(STRATEGIES as [string, ...string[]]),
  requestId: z.string().uuid().nullable(),
  section: z.string().max(40).nullable(),
  position: z.number().int().min(0).max(500).nullable(),
});

export async function notInterestedInRecommendation(input: z.infer<typeof schema>): Promise<{ ok: boolean; message: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "That could not be hidden." };
  if (!isSupabaseConfigured()) return { ok: false, message: "Recommendations are not connected." };

  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return { ok: false, message: "Sign in to tune recommendations." };

  const d = parsed.data;
  await recordRecommendationEvents({
    userId: user.id,
    sessionId: null,
    surface: d.surface as (typeof SURFACES)[number],
    strategy: d.strategy as (typeof STRATEGIES)[number],
    requestId: d.requestId,
    variant: null,
    section: d.section,
    events: [{ entityType: d.entityType, entityId: d.entityId, event: "not_interested", position: d.position, reason: null, source: null }],
  });
  return { ok: true, message: "Hidden. You will see less like this." };
}
