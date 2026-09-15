import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/app/app-shell";
import { AccountNotices } from "@/components/app/account-notices";
import { AdminLink } from "@/components/app/admin-link";
import { PlaceholderPage } from "@/components/app/placeholder-page";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";

export const metadata: Metadata = {
  title: "Pricing",
  description: "What Celpare costs, and what each plan includes.",
};

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  let signedIn = false;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    signedIn = Boolean(user);
  }

  return (
    <AppShell banner={<AccountNotices />} adminLink={<AdminLink />}
      signedIn={signedIn}
      signOutAction={
        <form action={signOut}>
          <Button variant="outline" size="sm" type="submit">
            Log out
          </Button>
        </form>
      }
    >
      <PlaceholderPage
        name="Pricing"
        what="The plans, what each one includes and what it costs. The limits behind them are already live: they are what decides your daily messages, web search and deep research today."
        when="Phase 7, with payments. The plan shapes are in docs/context/05-pricing-plans.md."
      />
    </AppShell>
  );
}
