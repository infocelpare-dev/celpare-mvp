import type { CompareGoal } from "@/lib/compare/types";

/*
  Presentation rules for Compare. Pure and deterministic: nothing here scores,
  ranks or chooses. It decides how a fact is DRAWN, never which item is better.
*/

/* ---------------------------------------------------------------------------
   Platforms
   --------------------------------------------------------------------------- */

/*
  tools.platforms is free text typed by whoever listed the tool, so "macOS",
  "Mac" and "mac os" all appear. The matrix needs one row per platform, so each
  value is folded onto a canonical name. A value that matches nothing is NOT
  dropped: it is shown under "Also listed" in the same words it was written,
  because silently discarding part of somebody's listing is inventing an absence.
*/
export const PLATFORMS = [
  "Web",
  "Windows",
  "macOS",
  "Linux",
  "iOS",
  "Android",
  "Browser extension",
  "API",
] as const;

export type Platform = (typeof PLATFORMS)[number];

const ALIASES: Record<string, Platform> = {
  web: "Web",
  "web app": "Web",
  browser: "Web",
  windows: "Windows",
  win: "Windows",
  macos: "macOS",
  mac: "macOS",
  "mac os": "macOS",
  osx: "macOS",
  linux: "Linux",
  ios: "iOS",
  iphone: "iOS",
  ipad: "iOS",
  android: "Android",
  "browser extension": "Browser extension",
  extension: "Browser extension",
  "chrome extension": "Browser extension",
  chrome: "Browser extension",
  api: "API",
};

export function foldPlatforms(listed: string[]): { known: Set<Platform>; other: string[] } {
  const known = new Set<Platform>();
  const other: string[] = [];
  for (const raw of listed) {
    const hit = ALIASES[raw.trim().toLowerCase()];
    if (hit) known.add(hit);
    else other.push(raw.trim());
  }
  return { known, other };
}

/* ---------------------------------------------------------------------------
   Goals
   --------------------------------------------------------------------------- */

/*
  What a goal changes, and it is ONLY presentation (brief section 27). The
  matching use case row moves to the top of Use cases, and the rows listed here
  carry a "Relevant to <goal>" marker. No item is scored, reordered, hidden or
  called a better fit because of it. The map is by hand and small on purpose:
  it states which ROWS are about a goal, which is a fact about the vocabulary,
  not a judgement about any product.
*/
export const GOAL_ROWS: Record<CompareGoal, { fit: string; related: string[] }> = {
  coding: { fit: "fit_coding", related: ["code_generation", "coding", "integration_github", "tool_calling", "agents"] },
  research: { fit: "fit_research", related: ["web_search", "file_analysis", "reasoning"] },
  writing: { fit: "fit_writing", related: ["text_generation", "multilingual"] },
  image: { fit: "fit_image", related: ["image_generation", "image_output", "vision"] },
  video: { fit: "fit_video", related: ["video_generation", "video_input"] },
  business: { fit: "fit_business", related: ["collaboration", "enterprise_controls", "integration_slack", "integration_google", "integration_microsoft", "deploy_enterprise"] },
  agents: { fit: "fit_agents", related: ["agents", "agentic", "tool_calling", "structured_outputs", "automation"] },
  api: { fit: "fit_api", related: ["deploy_api", "sdks", "streaming", "batch_processing", "structured_outputs", "tool_calling", "rate_limits"] },
  personal: { fit: "fit_personal", related: [] },
};

/* ---------------------------------------------------------------------------
   Values
   --------------------------------------------------------------------------- */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* "23 Sep 2026", in UTC, so the server and the browser print the same day. */
export function shortDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/* How long ago something was verified, for a freshness line. Coarse on purpose:
   "verified 3 days ago" is useful, "verified 71 hours ago" is noise. */
export function ageInDays(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / 86_400_000));
}

/*
  Pricing goes stale faster than anything else on the page. Past 90 days a
  verified price is still shown, with its date, and flagged as possibly out of
  date rather than presented as current. The number is a presentation threshold,
  not a claim about how often any provider changes prices.
*/
export const STALE_AFTER_DAYS = 90;

export function money(amount: number, currency: string | null): string {
  const code = currency ?? "USD";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 4,
    }).format(amount);
  } catch {
    return `${amount} ${code}`;
  }
}

/* Token counts read as 200K and 1.05M, which is how providers state them. */
export function tokens(n: number): string {
  if (n >= 1_000_000) return `${Number((n / 1_000_000).toFixed(2))}M`;
  if (n >= 1_000) return `${Number((n / 1_000).toFixed(1))}K`;
  return String(n);
}

export const PERIOD_LABEL: Record<string, string> = {
  month: "per month",
  year: "per year",
  one_time: "one time",
  usage: "usage based",
  custom: "custom terms",
};

export const TIER_LABEL: Record<string, string> = {
  free: "Free",
  individual: "Individual",
  team: "Team",
  business: "Business",
  enterprise: "Enterprise",
  usage: "Usage based",
  other: "Other",
};

export const LIFECYCLE_LABEL: Record<string, string> = {
  preview: "Preview",
  generally_available: "Generally available",
  deprecated: "Deprecated",
  retired: "Retired",
};

export const DOMAIN_LABEL: Record<string, string> = {
  reasoning: "Reasoning",
  coding: "Coding",
  knowledge: "Knowledge",
  math: "Mathematics",
  long_context: "Long context",
  multimodal: "Multimodal",
  agentic: "Agents and tool use",
  preference: "Human preference",
  other: "Other",
};
