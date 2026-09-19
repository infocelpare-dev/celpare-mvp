import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Container } from "@/components/ui/container";
import { BackLink } from "@/components/ui/back-link";
import { AppShell } from "@/components/app/app-shell";
import { AccountNotices } from "@/components/app/account-notices";
import { AdminLink } from "@/components/app/admin-link";
import { TermsGate } from "@/components/developer/terms-gate";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Developer terms",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/*
  The one screen between an ordinary account and the developer workspace.

  Rendered outside DeveloperShell on purpose: the developer navigation belongs
  to people who already agreed, and showing My Tools to somebody still reading
  what a developer is would be putting the workspace before the decision.
*/
export default async function DeveloperTermsPage() {
  if (!isSupabaseConfigured()) redirect("/community");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/get-started");

  // Already a developer: there is nothing to decide here.
  const { data: dev } = await supabase
    .from("developer_profiles")
    .select("accepted_terms_at")
    .eq("id", user.id)
    .maybeSingle();

  if (dev?.accepted_terms_at) redirect("/developer");

  return (
    <AppShell banner={<AccountNotices />} adminLink={<AdminLink />}
      signedIn
    >
      <Container className="max-w-[720px] py-10 sm:py-14">
        <BackLink href="/profile" label="Back to your profile" className="mb-5" />

        <h1 className="font-display text-[clamp(1.6rem,4vw,2.1rem)] font-semibold leading-tight">
          Become a developer on Celpare
        </h1>
        <p className="mt-3 max-w-[58ch] text-[15px] leading-relaxed text-muted">
          Read what this means before you agree. It is short, and it is the same
          boundary the platform actually enforces.
        </p>

        <div className="mt-8">
          <TermsGate />
        </div>
      </Container>
    </AppShell>
  );
}
