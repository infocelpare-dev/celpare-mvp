import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";
import { readAnonHash } from "@/lib/ai/identity";
import { SPONSORED_ACTIVE } from "./config";
import {
  NO_VIEWER_STATE,
  rankSponsored,
  type Campaign,
  type RankOutput,
  type SponsoredCandidate,
  type ViewerState,
} from "./rank";

/*
  Sponsored Tools Ranking v1, the server half (D204, D205).

  Reads the live campaigns (cached a minute), reads what this viewer has
  already been served, ranks with the pure ranker, and records the serve.
  Every read and write goes through the service role: campaign performance is
  the advertiser's business and the viewer rows are nobody else's.

  ANY FAILURE IS NO ADS. Losing this never makes the organic results wrong,
  and showing nothing is the safe way to fail.
*/

const TTL_MS = 60_000;
let cache: { at: number; campaigns: Campaign[] } | null = null;

type CampaignRow = {
  sponsorship_id: string;
  tool_id: string;
  slug: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  tool_status: string;
  placement_suspended: boolean;
  owner_active: boolean;
  frequency_cap: number | null;
  verified: boolean;
  rating: number | string | null;
  rating_count: number | null;
  like_count: number | null;
  dislike_count: number | null;
  has_logo: boolean;
  has_tagline: boolean;
  has_description: boolean;
  website_https: boolean;
  domain_verified: boolean;
  freshness_at: string | null;
  categories: string[] | null;
  views_30d: number;
  clicks_30d: number;
  saves_30d: number;
  reporters_30d: number;
  open_reports: number;
};

export function toCampaign(r: CampaignRow): Campaign {
  return {
    sponsorshipId: r.sponsorship_id,
    toolId: r.tool_id,
    slug: r.slug,
    status: r.status,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    toolStatus: r.tool_status,
    placementSuspended: Boolean(r.placement_suspended),
    ownerActive: Boolean(r.owner_active),
    frequencyCap: r.frequency_cap,
    verified: Boolean(r.verified),
    rating: r.rating === null ? null : Number(r.rating),
    ratingCount: r.rating_count ?? 0,
    likeCount: r.like_count ?? 0,
    dislikeCount: r.dislike_count ?? 0,
    hasLogo: Boolean(r.has_logo),
    hasTagline: Boolean(r.has_tagline),
    hasDescription: Boolean(r.has_description),
    websiteHttps: Boolean(r.website_https),
    domainVerified: Boolean(r.domain_verified),
    freshnessAt: r.freshness_at,
    categories: r.categories ?? [],
    views30d: r.views_30d ?? 0,
    clicks30d: r.clicks_30d ?? 0,
    saves30d: r.saves_30d ?? 0,
    reporters30d: r.reporters_30d ?? 0,
    openReports: r.open_reports ?? 0,
  };
}

/* The live campaigns. Activation and expiry are measured in days, so a
   minute of cache is invisible and spares Search a round trip. */
export async function getSponsoredCampaigns(): Promise<Campaign[]> {
  if (!hasServiceRole()) return [];
  if (cache && Date.now() - cache.at < TTL_MS) return cache.campaigns;
  try {
    const { data, error } = await createAdminClient().rpc("sponsored_campaigns", { p_all: false });
    if (error) {
      console.error("[sponsored] campaigns failed", error.code, error.message);
      return cache?.campaigns ?? [];
    }
    const campaigns = ((data ?? []) as CampaignRow[]).map(toCampaign);
    cache = { at: Date.now(), campaigns };
    return campaigns;
  } catch (err) {
    console.error("[sponsored] campaigns threw", err);
    return cache?.campaigns ?? [];
  }
}

/* Every run, live or not, through the admin's own session (admin_require). */
export async function getAllCampaignsAsAdmin(db: SupabaseClient): Promise<Campaign[]> {
  const { data, error } = await db.rpc("admin_sponsored_campaigns");
  if (error) throw new Error(`sponsored campaigns: ${error.message}`);
  return ((data ?? []) as CampaignRow[]).map(toCampaign);
}

/* -------------------------------------------------------------- the viewer */

/*
  Who is looking, as the frequency cap sees them. A signed in person is their
  account; anyone else is the same HMAC Ask's limits use, never a raw address.
*/
export async function viewerKey(userId: string | null): Promise<string> {
  if (userId) return `u:${userId}`;
  return `a:${await readAnonHash()}`;
}

/* The anonymous key from a known hash, for Ask, whose identity has it. */
export function viewerKeyFrom(userId: string | null, anonHash: string | null): string | null {
  if (userId) return `u:${userId}`;
  return anonHash ? `a:${anonHash}` : null;
}

export function queryKey(text: string): string {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 500);
  return createHash("sha256").update(normalized).digest("hex").slice(0, 32);
}

async function viewerState(key: string, surface: "search" | "ask"): Promise<ViewerState> {
  try {
    const { data, error } = await createAdminClient().rpc("sponsored_viewer_state", { p_viewer: key, p_surface: surface });
    if (error) {
      console.error("[sponsored] viewer state failed", error.code, error.message);
      return NO_VIEWER_STATE;
    }
    const rows = (data ?? []) as {
      tool_id: string;
      served_24h: number;
      dismissed: boolean;
      in_last_serve: boolean;
      last_query_key: string | null;
    }[];
    return {
      tools: new Map(
        rows.map((r) => [r.tool_id, { served24h: r.served_24h ?? 0, dismissed: Boolean(r.dismissed), inLastServe: Boolean(r.in_last_serve) }]),
      ),
      lastQueryKey: rows[0]?.last_query_key ?? null,
    };
  } catch (err) {
    console.error("[sponsored] viewer state threw", err);
    return NO_VIEWER_STATE;
  }
}

/* ------------------------------------------------------------------ serving */

export type Serve = RankOutput & { requestId: string | null };

const NOTHING: Serve = { version: SPONSORED_ACTIVE.version, picks: [], decisions: [], requestId: null };

/*
  Rank and record one serve. `record: false` ranks without writing anything,
  which the admin debug view uses so a test query never counts as an ad shown.
*/
export async function serveSponsored(input: {
  surface: "search" | "ask";
  query: string;
  candidates: SponsoredCandidate[];
  viewer: string | null;
  userId: string | null;
  record?: boolean;
}): Promise<Serve> {
  if (input.candidates.length === 0) return NOTHING;
  const campaigns = await getSponsoredCampaigns();
  if (campaigns.length === 0) return NOTHING;
  const sponsored = new Set(campaigns.map((c) => c.toolId));
  if (!input.candidates.some((c) => sponsored.has(c.toolId))) return NOTHING;

  const qk = queryKey(input.query);
  const viewer = input.viewer ? await viewerState(input.viewer, input.surface) : NO_VIEWER_STATE;
  const ranked = rankSponsored({ surface: input.surface, campaigns, candidates: input.candidates, viewer, queryKey: qk });
  if (ranked.picks.length === 0) return { ...ranked, requestId: null };

  const requestId = randomUUID();
  if (input.record !== false && input.viewer) {
    void recordServe(input.viewer, input.userId, input.surface, requestId, qk, ranked);
  }
  return { ...ranked, requestId };
}

async function recordServe(
  viewer: string,
  userId: string | null,
  surface: "search" | "ask",
  requestId: string,
  qk: string,
  ranked: RankOutput,
): Promise<void> {
  try {
    const { error } = await createAdminClient().rpc("record_sponsored_serve", {
      p_viewer: viewer,
      p_user: userId,
      p_surface: surface,
      p_request: requestId,
      p_query_key: qk,
      p_items: ranked.picks.map((p) => ({
        tool_id: p.toolId,
        sponsorship_id: p.sponsorshipId,
        position: p.position,
        algorithm: ranked.version,
      })),
    });
    if (error) console.error("[sponsored] serve record failed", error.code, error.message);
  } catch (err) {
    console.error("[sponsored] serve record threw", err);
  }
}

/* ------------------------------------------------------------------- events */

export const CLIENT_EVENTS = ["view", "click", "save", "conversion", "dismiss", "report"] as const;
export type ClientEvent = (typeof CLIENT_EVENTS)[number];
export const REPORT_REASONS = ["irrelevant", "misleading", "offensive", "spam", "other"] as const;

/*
  Events a browser can honestly observe on a sponsored card. The tool must be
  sponsored right now, and the sponsorship id is looked up here, never taken
  from the body. Aggregates only ever leave this table (admin_sponsorship_stats).
*/
export async function recordSponsoredEvents(input: {
  viewer: string;
  userId: string | null;
  surface: "search" | "ask";
  requestId: string | null;
  events: { toolId: string; event: ClientEvent; position: number | null; reason: string | null }[];
}): Promise<void> {
  if (!hasServiceRole()) return;
  const campaigns = await getSponsoredCampaigns();
  const byTool = new Map(campaigns.map((c) => [c.toolId, c]));
  const rows = input.events.slice(0, 20).flatMap((e) => {
    const c = byTool.get(e.toolId);
    if (!c) return [];
    return [
      {
        sponsorship_id: c.sponsorshipId,
        tool_id: c.toolId,
        user_id: input.userId,
        viewer_key: input.viewer,
        surface: input.surface,
        event: e.event,
        position: e.position === null ? null : Math.max(0, Math.min(2, Math.trunc(e.position))),
        request_id: input.requestId,
        algorithm: SPONSORED_ACTIVE.version,
        reason: e.event === "report" && e.reason && (REPORT_REASONS as readonly string[]).includes(e.reason) ? e.reason : null,
      },
    ];
  });
  if (rows.length === 0) return;
  try {
    const { error } = await createAdminClient().from("sponsored_events").insert(rows);
    if (error) console.error("[sponsored] events failed", error.code, error.message);
    /* A dismissal or a report changes what this viewer and every viewer sees,
       so the next request reads fresh campaign counts. */
    if (rows.some((r) => r.event === "report")) cache = null;
  } catch (err) {
    console.error("[sponsored] events threw", err);
  }
}
