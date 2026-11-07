import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ViewerPlans } from "./due";

/*
  The viewer's two plans and Developer Mode, read through their own session.
  Used by /app (the plans gate), /plans and /pricing so the three agree.

  profiles.plan is readable only by its owner, through my_profile_private()
  (D194). developer_profiles.plan is the developer plan (D200); no row means
  the developer Free plan. Each failed read is null, never "free".
*/
export async function getViewerPlans(db: SupabaseClient, userId: string): Promise<ViewerPlans> {
  const [priv, own, dev] = await Promise.all([
    db.rpc("my_profile_private"),
    db.from("profiles").select("is_developer").eq("id", userId).maybeSingle(),
    db.from("developer_profiles").select("plan").eq("id", userId).maybeSingle(),
  ]);
  if (priv.error) console.error("[pricing] plan read failed", priv.error.code, priv.error.message);
  if (own.error) console.error("[pricing] developer mode read failed", own.error.code, own.error.message);
  if (dev.error) console.error("[pricing] developer plan read failed", dev.error.code, dev.error.message);

  const plan = priv.error
    ? null
    : ((priv.data as { plan: string | null } | null)?.plan ?? "free");
  const developerPlan = dev.error
    ? null
    : ((dev.data as { plan: string | null } | null)?.plan ?? "free");

  return {
    plan,
    developerPlan,
    isDeveloper: Boolean((own.data as { is_developer?: boolean } | null)?.is_developer),
  };
}
