import { FEATURES, PLAN_LIMITS } from "./config";
import { arePaidPlansOn } from "@/lib/platform/settings";
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

/* The plans someone can be on right now. While paid plans are paused (D271,
   the features.paid_plans switch) only anon and free can be reached, and a
   mode only Pro or Premium has is not offered at all: hidden, not locked. */
function reachable(plansOn: boolean): Plan[] {
  return plansOn ? PLAN_ORDER : ["anon", "free"];
}

/* The lowest plan whose limits turn a capability on. Derived rather than
   written down twice, so moving web search to another plan moves the lock with
   it. Null when no reachable plan has it. */
export function lowestPlanWith(
  key: "toolSearch" | "webSearch" | "researchMode",
  plansOn = true,
): Plan | null {
  return reachable(plansOn).find((p) => PLAN_LIMITS[p][key]) ?? null;
}

export function grantsFor(plan: Plan, feature: AiFeature = "ask", plansOn = false): ModeGrants {
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
      requires: lowestPlanWith("toolSearch", plansOn),
      offered: lowestPlanWith("toolSearch", plansOn) !== null,
    },
    webSearch: {
      allowed: config.canWebSearch && limits.webSearch && webConfigured,
      requires: lowestPlanWith("webSearch", plansOn),
      offered: lowestPlanWith("webSearch", plansOn) !== null,
    },
    deepResearch: {
      allowed: limits.researchMode && config.canWebSearch && webConfigured,
      requires: lowestPlanWith("researchMode", plansOn),
      offered: lowestPlanWith("researchMode", plansOn) !== null,
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
  const grants = grantsFor(identity.plan, "ask", await arePaidPlansOn());

  return {
    plan: identity.plan,
    grants,
    defaults: {
      toolSearch: grants.toolSearch.allowed,
      webSearch: grants.webSearch.allowed && identity.settings.webSearch !== false,
      // Off until the person turns it on; then it stays as they left it (D233).
      // It costs several searches, so it is opted into, never defaulted on.
      deepResearch: grants.deepResearch.allowed && identity.settings.deepResearch === true,
    },
  };
}
