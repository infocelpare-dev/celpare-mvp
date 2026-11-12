import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { getOnboarding } from "@/lib/onboarding/server";
import { getViewerPlans } from "@/lib/pricing/viewer";
import { isFreeForPlans, PLANS_COOKIE } from "@/lib/pricing/due";

/*
  Every entry path lands here: sign up, log in, the OAuth callback, and skip.

  The home is /ask (D267, 2026-11-12, superseding D27's /community: the feed
  was too thin to hold a new account, Ask answers on the first visit), so this
  redirects rather than duplicating it.
  Kept as a route instead of being deleted because four separate entry paths
  point at /app, and changing all of them at once is a bigger change than one
  redirect, with more places to get it wrong.

  That single funnel is also where onboarding is gated (phase ONB): a signed
  in account with no onboarded_at goes to /welcome once. Accounts that existed
  before ONB were marked done by its migration (founder 2026-10-31: new
  accounts only). A failed read goes home, never to a loop.

  Then the plans (phase PLANS, D228): a returning login carries the cp_plans
  cookie from afterLogin, and a free account goes to /plans once. Paying
  accounts, and any failed read, go straight home.
*/
export default async function AppPage() {
  if (isSupabaseConfigured()) {
    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (user) {
      const state = await getOnboarding(db);
      if (state && !state.onboardedAt) redirect("/welcome");

      const due = (await cookies()).get(PLANS_COOKIE)?.value === "1";
      if (due && isFreeForPlans(await getViewerPlans(db, user.id))) redirect("/plans");
    }
  }
  redirect("/ask");
}
