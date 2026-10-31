import { redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { getOnboarding } from "@/lib/onboarding/server";

/*
  Every entry path lands here: sign up, log in, the OAuth callback, and skip.

  The home is /community (D27), so this redirects rather than duplicating it.
  Kept as a route instead of being deleted because four separate entry paths
  point at /app, and changing all of them at once is a bigger change than one
  redirect, with more places to get it wrong.

  That single funnel is also where onboarding is gated (phase ONB): a signed
  in account with no onboarded_at goes to /welcome once. Accounts that existed
  before ONB were marked done by its migration (founder 2026-10-31: new
  accounts only). A failed read goes to the feed, never to a loop.
*/
export default async function AppPage() {
  if (isSupabaseConfigured()) {
    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (user) {
      const state = await getOnboarding(db);
      if (state && !state.onboardedAt) redirect("/welcome");
    }
  }
  redirect("/community");
}
