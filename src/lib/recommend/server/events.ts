import "server-only";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";
import { SURFACES, STRATEGIES, type Strategy, type Surface } from "../types";
import { TMR_ALGORITHM } from "../versions";

/*
  Engine events (D184). Every impression, open, save, compare add, dismiss and
  not interested on an engine card lands in recommendation_events with the
  algorithm, strategy, surface, request id and position, so a number can always
  be traced to the system and the request that produced it.

  Written with the service role only. The user id comes from the session in the
  route or action, never from the body, and `algorithm` is set here, never taken
  from a client (D171's rule). Fire and forget: a failed write is logged.
*/

export const REC_EVENTS = ["impression", "click", "save", "compare_add", "dismiss", "not_interested"] as const;
export type RecEventKind = (typeof REC_EVENTS)[number];

export type RecEvent = {
  entityType: "tool" | "model";
  entityId: string;
  event: RecEventKind;
  position: number | null;
  reason: string | null;
  source: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECTION = /^[a-z-]{1,40}$/;
const CODE = /^[a-z_]{1,40}$/;

export async function recordRecommendationEvents(input: {
  userId: string | null;
  sessionId: string | null;
  surface: Surface;
  strategy: Strategy;
  requestId: string | null;
  variant: string | null;
  section: string | null;
  events: RecEvent[];
}): Promise<void> {
  if (!hasServiceRole()) return;
  if (!SURFACES.includes(input.surface) || !STRATEGIES.includes(input.strategy)) return;
  const rows = input.events.slice(0, 60).flatMap((e) => {
    if (!UUID.test(e.entityId) || (e.entityType !== "tool" && e.entityType !== "model")) return [];
    return [
      {
        user_id: input.userId,
        tool_id: e.entityType === "tool" ? e.entityId : null,
        surface: input.surface,
        candidate_source: e.source && CODE.test(e.source) ? e.source : null,
        event: e.event,
        position: e.position === null ? null : Math.max(0, Math.min(500, Math.trunc(e.position))),
        entity_type: e.entityType,
        entity_id: e.entityId,
        entity_key: null,
        section: input.section && SECTION.test(input.section) ? input.section : null,
        algorithm: TMR_ALGORITHM,
        strategy: input.strategy,
        request_id: input.requestId && UUID.test(input.requestId) ? input.requestId : null,
        variant: input.variant && /^[a-z0-9_]{1,40}$/.test(input.variant) ? input.variant : null,
        reason: e.reason && CODE.test(e.reason) ? e.reason : null,
        /* Only for somebody with no account, as the feed and Explore do. */
        session_id: input.userId ? null : input.sessionId,
      },
    ];
  });
  if (rows.length === 0) return;
  try {
    const { error } = await createAdminClient().from("recommendation_events").insert(rows);
    if (error) console.error("[recommend] events failed", error.code, error.message);
  } catch (err) {
    console.error("[recommend] events threw", err);
  }
}
