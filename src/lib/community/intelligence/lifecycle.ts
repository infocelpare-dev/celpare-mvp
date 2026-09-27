import { DISTRIBUTION, type DistributionState } from "./distribution";
import { clamp01 } from "./math";

/*
  distribution_v2: a post's stored lifecycle, as the rankers read it.

  THE STATE MACHINE IS IN THE DATABASE, not here. post_intelligence_tick() runs
  every five minutes under pg_cron, measures each active post, and moves it
  through post_next_stage() (docs/context/13-post-intelligence.md section 5).
  This file is the TypeScript half: the stage names, the same thresholds (so the
  admin page can say when the two copies differ), how a stored wave becomes an
  audience and a lift, the staleness rule, and the plain words the author sees.

  WHEN THE STATE IS MISSING OR STALE (D142), stateToDistribution() returns null
  and the caller uses distributionStage(), the per request computation from
  distribution_v1. A stopped cron job makes ranking less informed, never empty.
*/

export const STAGES = [
  "uploaded",
  "held",
  "testing",
  "promising",
  "accelerating",
  "trending",
  "viral",
  "peak",
  "cooling",
  "long_tail",
  "suppressed",
] as const;
export type Stage = (typeof STAGES)[number];

/* The same object post_intelligence_config holds. Change both together. */
export const LIFECYCLE_CONFIG = {
  version: 1,
  stale_minutes: 20,
  active_days: 7,
  snapshot_retention_days: 30,
  k_pseudo: 10,
  min_ref_rate: 0.02,
  min_ref_hourly: 0.15,
  new_creator_factor: 0.5,
  test_viewers: 12,
  test_max_hours: 48,
  test_fail_viewers: 40,
  test_fail_perf: 0.8,
  promising_perf: 1.2,
  accelerating_ratio: 1.5,
  rising_ticks: 2,
  trending_ratio: 2,
  trending_participants: 3,
  trending_max_negative: 0.05,
  viral_ratio: 5,
  viral_engagers: 6,
  viral_diversity: 0.5,
  peak_fraction: 0.8,
  peak_ticks: 2,
  flat_hours: 6,
  cooling_to_long_tail_hours: 48,
  suppress_viewers: 10,
  suppress_negative: 0.08,
  held_spam: 0.85,
  held_pending_reports: 2,
  wave_hold_ratio: 0.8,
  wave_min_new_viewers: 5,
  new_author_posts: 5,
  default_platform_rate: 0.1,
  default_platform_hourly: 0.3,
  recover_minutes: 10,
  units: { like: 1, comment: 2, save: 2.5, repost: 3, share: 3, complete: 1, follow_after: 4 },
} as const;

/* JSON with object keys sorted: jsonb stores keys in its own order, so a plain
   JSON.stringify called equal nested objects different (found on the admin
   page, "units" reported as drift). */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

/* Keys whose values differ between this file and the database's copy. */
export function configDrift(db: Record<string, unknown> | null | undefined): string[] {
  if (!db) return ["(no database config)"];
  const out: string[] = [];
  for (const [k, v] of Object.entries(LIFECYCLE_CONFIG)) {
    if (stable(v) !== stable(db[k])) out.push(k);
  }
  for (const k of Object.keys(db)) if (!(k in LIFECYCLE_CONFIG)) out.push(k);
  return out;
}

/* A post's stored state, as post_states() returns it. */
export type StoredPostState = {
  postId: string;
  stage: Stage;
  wave: number;
  newAuthor: boolean;
  perfScore: number | null;
  velocity: number;
  referenceHourly: number | null;
  stageSince: number;
  computedAt: number;
  stale: boolean;
};

/*
  Waves (TikTok): who beyond followers may see the post, and how strongly it is
  lifted. Wave 0 is distribution_v1's test slice, so nothing changes for a post
  that has not earned more.
*/
export const WAVES = [
  { fraction: DISTRIBUTION.FRACTION.test, boost: 0.6, target: 20 },
  { fraction: 0.6, boost: 0.7, target: 60 },
  { fraction: 1, boost: 0.8, target: 180 },
  { fraction: 1, boost: 0.9, target: 540 },
  { fraction: 1, boost: 1, target: Infinity },
] as const;

/* Stages no discovery surface (Explore, Trending, Rising, exploration picks)
   may show. They still reach followers, and rank last elsewhere (D126). */
export const NOT_FOR_DISCOVERY: ReadonlySet<Stage> = new Set(["uploaded", "held", "suppressed"]);

export function isFresh(s: StoredPostState | undefined, now: number): s is StoredPostState {
  if (!s || s.stale) return false;
  return now - s.computedAt <= LIFECYCLE_CONFIG.stale_minutes * 60_000;
}

/*
  The stored state as distribution_v1's shape, so the pipeline's audience check
  and distributionBoost keep working unchanged. Null means: compute it the old
  way. The perf score scales the lift inside a wave (a post doing twice its
  usual in wave 1 outranks one doing its usual), capped so it cannot outrun the
  next wave.
*/
export function stateToDistribution(
  s: StoredPostState | undefined,
  viewers: number,
  now: number,
): (DistributionState & { boost: number }) | null {
  if (!isFresh(s, now)) return null;

  const perfLift = s.perfScore === null ? 1 : 0.85 + 0.3 * clamp01(s.perfScore / 2);
  const wave = WAVES[Math.max(0, Math.min(WAVES.length - 1, s.wave))];

  switch (s.stage) {
    case "uploaded":
    case "testing": {
      /* New author boost (X): a creator's first posts get wave 1's slice. */
      const fraction = s.newAuthor ? Math.max(wave.fraction, WAVES[1].fraction) : wave.fraction;
      return { stage: "test", fraction, viewers, boost: wave.boost * perfLift };
    }
    case "held":
    case "suppressed":
      return { stage: "reduce", fraction: DISTRIBUTION.FRACTION.reduce, viewers, boost: 0.15 };
    case "promising":
    case "accelerating":
      return { stage: "expand", fraction: wave.fraction, viewers, boost: wave.boost * perfLift };
    case "trending":
    case "viral":
      return { stage: "broad", fraction: 1, viewers, boost: wave.boost * perfLift };
    case "peak":
    case "cooling":
      return { stage: "maintain", fraction: wave.fraction, viewers, boost: Math.min(0.7, wave.boost) * perfLift };
    case "long_tail":
      return { stage: "maintain", fraction: 1, viewers, boost: 0.4 };
  }
}

/* ------------------------------------------------ what the author reads */

/* A stage in the author's words. Never a score, never a comparison with
   anybody else's post. */
export const STAGE_WORDS: Record<Stage, string> = {
  uploaded: "Getting ready",
  held: "Shown to your followers",
  testing: "Being shown to a first group of people",
  promising: "People responded well, so it is being shown more widely",
  accelerating: "Picking up speed",
  trending: "Trending on Celpare",
  viral: "Reaching far more people than usual",
  peak: "At its busiest",
  cooling: "Slowing down",
  long_tail: "Still findable in search and saves",
  suppressed: "Shown to fewer people after negative feedback",
};

/* Why a transition happened, from the rule the database recorded. */
export const RULE_WORDS: Record<string, string> = {
  test_passed: "The first group responded better than your usual",
  test_ended: "The first test finished",
  speeding_up: "Engagement kept getting faster",
  trending: "Several people took part within a day",
  viral: "It spread well beyond your followers",
  past_peak: "Engagement passed its peak",
  slowing: "Engagement slowed below your usual pace",
  flat: "Engagement levelled off",
  cooled: "It has been quiet for two days",
  cooling_step: "Shown a little less each hour",
  wave_underperformed: "The wider group responded less, so it stepped back one level",
  resurgence: "It started picking up again",
  age: "It is more than a week old",
  negative_feedback: "Several people asked to see less of it",
  upheld_report: "A moderator upheld a report",
  released: "It passed its checks",
  recovered: "Negative feedback eased",
};

/* The order stages move upward in, for notices that only ever go up. */
export const UPWARD: Stage[] = ["testing", "promising", "accelerating", "trending", "viral"];
