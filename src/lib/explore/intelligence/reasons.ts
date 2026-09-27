import { EXPLORE_V1 } from "./config";
import type { FeatureReading } from "./features";
import type { Momentum } from "./momentum";
import type { ExploreReason, ExploreReasonCode, ExploreScored, ExploreSectionId } from "./types";

/*
  Why somebody is seeing an item (brief section 29).

  A REASON IS ONLY PRODUCED WHEN THE FEATURE BEHIND IT CROSSED ITS THRESHOLD.
  "Because you explored AI video" needs a real session match; "3 people you
  follow saved this" needs three real followed savers, and a save count below
  two is never shown (D155). No score, weight or internal number is ever part
  of a reason. Names of people are never part of one either: social proof is
  counts only (D136). The label is the name of a thing (a topic, a category, a
  tool the viewer opened), never of a person.
*/

export type ReasonContext = {
  section: ExploreSectionId;
  reading: FeatureReading;
  momentum: Momentum;
  isNew: boolean;
  /* The strongest matching taxonomy key's label, when relevance came from one. */
  interestLabel: string | null;
  /* The session seed it relates to, by title. */
  sessionLabel: string | null;
};

const PRIORITY: Record<ExploreSectionId, ExploreReasonCode[]> = {
  "for-you": ["network_saved", "network_reviewed", "network_posted", "network_commented", "network_reposted", "session_interest", "saved_similar", "interest", "trending", "rising", "new", "exploration"],
  trending: ["trending", "network_commented", "network_posted", "interest"],
  rising: ["rising", "interest"],
  "new-and-recent": ["new", "interest"],
  "recommended-tools": ["network_saved", "network_reviewed", "session_interest", "saved_similar", "interest", "trending", "rising", "exploration"],
  "recommended-models": ["network_saved", "network_posted", "session_interest", "saved_similar", "interest", "trending", "rising", "exploration"],
  people: ["mutual_follows", "follows_you", "shared_topics", "interest"],
  topics: ["session_interest", "interest", "trending", "rising", "exploration"],
  discussions: ["network_commented", "network_reposted", "interest", "trending"],
  videos: ["session_interest", "interest", "trending", "rising"],
  "continue-exploring": ["session_interest", "saved_similar"],
};

function candidates(s: ExploreScored, ctx: ReasonContext): Map<ExploreReasonCode, ExploreReason> {
  const out = new Map<ExploreReasonCode, ExploreReason>();
  const f = ctx.reading.features;
  const n = s.candidate.facts.network;
  const P = EXPLORE_V1.PROOF;
  const R = EXPLORE_V1.REASON;
  if (n) {
    if (n.savers >= P.SAVERS_MIN) out.set("network_saved", { code: "network_saved", label: null, count: n.savers });
    if (n.reviewers >= P.REVIEWERS_MIN) out.set("network_reviewed", { code: "network_reviewed", label: null, count: n.reviewers });
    if (n.posters >= P.POSTERS_MIN) out.set("network_posted", { code: "network_posted", label: null, count: n.posters });
    if (n.commenters >= P.COMMENTERS_MIN) out.set("network_commented", { code: "network_commented", label: null, count: n.commenters });
    if (n.reposters >= P.REPOSTERS_MIN) out.set("network_reposted", { code: "network_reposted", label: null, count: n.reposters });
  }
  if (f.sessionRelevance >= R.SESSION && ctx.sessionLabel) {
    out.set("session_interest", { code: "session_interest", label: ctx.sessionLabel, count: null });
  }
  if (f.similarity >= R.SIMILAR) out.set("saved_similar", { code: "saved_similar", label: null, count: null });
  if (f.personalRelevance >= R.INTEREST && ctx.interestLabel) {
    out.set("interest", { code: "interest", label: ctx.interestLabel, count: null });
  }
  if (ctx.momentum.trending) out.set("trending", { code: "trending", label: null, count: null });
  if (ctx.momentum.rising) out.set("rising", { code: "rising", label: null, count: null });
  if (ctx.isNew) out.set("new", { code: "new", label: null, count: null });
  if (s.exploration) out.set("exploration", { code: "exploration", label: null, count: null });
  const pf = s.candidate.facts;
  if (s.candidate.entityType === "person") {
    if ((pf.mutualFollows ?? 0) >= 1) out.set("mutual_follows", { code: "mutual_follows", label: null, count: pf.mutualFollows ?? 0 });
    if (pf.followsViewer) out.set("follows_you", { code: "follows_you", label: null, count: null });
    if (f.personalRelevance >= R.INTEREST) out.set("shared_topics", { code: "shared_topics", label: ctx.interestLabel, count: null });
  }
  return out;
}

export function reasonFor(s: ExploreScored, ctx: ReasonContext): ExploreReason | null {
  const available = candidates(s, ctx);
  for (const code of PRIORITY[ctx.section]) {
    const r = available.get(code);
    if (r) return r;
  }
  return null;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/* The sentence a person reads. Counts only, never names. */
export function explainExploreReason(r: ExploreReason): string {
  const c = r.count ?? 0;
  switch (r.code) {
    case "network_saved":
      return `${c} people you follow saved this`;
    case "network_reviewed":
      return `${c} ${plural(c, "person", "people")} you follow reviewed this`;
    case "network_posted":
      return `${c} ${plural(c, "person", "people")} you follow posted about this`;
    case "network_commented":
      return `${c} ${plural(c, "person", "people")} you follow commented`;
    case "network_reposted":
      return `${c} ${plural(c, "person", "people")} you follow reposted this`;
    case "session_interest":
      return r.label ? `Because you explored ${r.label}` : "Related to what you are exploring";
    case "saved_similar":
      return "Like things you saved";
    case "interest":
      return r.label ? `Because you are into ${r.label}` : "Matches your interests";
    case "explored_topic":
      return r.label ? `Because you explored ${r.label}` : "From a topic you explored";
    case "followed_author":
      return "From someone you follow";
    case "trending":
      return "Trending on Celpare";
    case "rising":
      return "Picking up speed";
    case "new":
      return "New on Celpare";
    case "exploration":
      return "Something different";
    case "mutual_follows":
      return `${c} mutual ${plural(c, "follow", "follows")}`;
    case "follows_you":
      return "Follows you";
    case "shared_topics":
      return r.label ? `Also into ${r.label}` : "Shares your interests";
    case "resurfaced":
      return "Worth another look";
  }
}
