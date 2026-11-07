/*
  Who sees /plans after a login (phase PLANS, D228). Pure, so it is tested
  without a database.

  A returning login on a free plan sees the plans once. For an account with
  Developer Mode on, either plan being free is enough, because the page opens
  on the developer plans and can switch to the individual ones.

  A read that failed is null, and null is never free: showing an upsell to
  someone who already pays is worse than missing one (same rule as the
  Upgrade icon).
*/

export type ViewerPlans = {
  /* profiles.plan through my_profile_private (D194); null when the read failed. */
  plan: string | null;
  /* developer_profiles.plan (D200); "free" when there is no row; null when the read failed. */
  developerPlan: string | null;
  isDeveloper: boolean;
};

export const PLANS_COOKIE = "cp_plans";

export function isFreeForPlans(v: ViewerPlans | null): boolean {
  if (!v) return false;
  if (v.plan === "free") return true;
  return v.isDeveloper && v.developerPlan === "free";
}
