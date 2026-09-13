import { FEATURES, PLAN_LIMITS } from "./config";
import { isWebSearchConfigured } from "./web-search";
import type { AiFeature, ModeGrants, Plan } from "./types";

/*
  Which retrieval modes a plan may use, in one place.

  Server side only, on purpose. The composer renders locks from what the server
  sends it, rather than working out permissions from the plan name in the
  browser, so there is one implementation of the rule and the browser's copy is
  a label rather than a decision.
*/

export const PLAN_ORDER: Plan[] = ["anon", "free", "pro", "premium"];

/* The lowest plan whose limits turn a capability on. Derived rather than
   written down twice, so moving web search to another plan moves the lock with
   it. */
export function lowestPlanWith(
  key: "toolSearch" | "webSearch" | "researchMode",
): Plan | null {
  return PLAN_ORDER.find((p) => PLAN_LIMITS[p][key]) ?? null;
}

export function grantsFor(plan: Plan, feature: AiFeature = "ask"): ModeGrants {
  const limits = PLAN_LIMITS[plan];
  const config = FEATURES[feature];

  /*
    Web search and deep research both depend on the Serper key existing. An
    unconfigured key locks the toggle rather than letting someone turn it on and
    silently get nothing, which is the failure that is impossible to tell apart
    from a bad answer.
  */
  const webConfigured = isWebSearchConfigured();

  return {
    toolSearch: {
      allowed: config.canToolSearch && limits.toolSearch,
      requires: lowestPlanWith("toolSearch"),
    },
    webSearch: {
      allowed: config.canWebSearch && limits.webSearch && webConfigured,
      requires: lowestPlanWith("webSearch"),
    },
    deepResearch: {
      allowed: limits.researchMode && config.canWebSearch && webConfigured,
      requires: lowestPlanWith("researchMode"),
    },
  };
}

/*
  What the composer starts with, for a server component rendering the page.

  Defaults are the plan's own: a mode the plan does not have starts off and
  renders locked, and web search additionally respects the saved preference
  from settings, so turning it off there means it is off when the page opens
  rather than on until you notice.
*/
export async function composerConfig(): Promise<{
  plan: Plan;
  grants: ModeGrants;
  defaults: Record<"toolSearch" | "webSearch" | "deepResearch", boolean>;
}> {
  const { identify } = await import("./identity");
  const identity = await identify();
  const grants = grantsFor(identity.plan);

  return {
    plan: identity.plan,
    grants,
    defaults: {
      toolSearch: grants.toolSearch.allowed,
      webSearch: grants.webSearch.allowed && identity.settings.webSearch !== false,
      // Never on by default. It costs several searches, and a mode that expensive
      // is opted into rather than out of.
      deepResearch: false,
    },
  };
}
