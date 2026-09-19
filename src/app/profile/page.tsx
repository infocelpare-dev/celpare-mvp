import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Container } from "@/components/ui/container";
import { BackLink } from "@/components/ui/back-link";
import { AppShell } from "@/components/app/app-shell";
import { AccountNotices } from "@/components/app/account-notices";
import { AdminLink } from "@/components/app/admin-link";
import { ProfileView } from "@/components/profile/profile-view";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { getViewerState } from "@/lib/community/queries";
import {
  getFeaturedTools,
  getProfileById,
  getTabRows,
  isTabKey,
  visibleTabs,
} from "@/lib/profile/queries";

export const metadata: Metadata = {
  title: "Profile",
  // Your own profile stays out of the index. The public version at
  // /u/[username] is the one built to be found.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  if (!isSupabaseConfigured()) redirect("/community");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // A profile belongs to an account. This guard was missing while the page was
  // a placeholder: a signed out visitor used to get the placeholder rather
  // than the gate. Same pattern as settings/page.tsx.
  if (!user) redirect("/get-started");

  const profile = await getProfileById(supabase, user.id);

  // The signup trigger creates this row, so its absence means something is
  // genuinely wrong rather than that the person is new.
  if (!profile) redirect("/community");

  const tabs = visibleTabs(true, profile);
  const params = await searchParams;
  const activeTab = isTabKey(params.tab, tabs) ? params.tab : "posts";

  const [rows, featuredTools, submissions] = await Promise.all([
    getTabRows(supabase, activeTab, profile, true),
    getFeaturedTools(supabase, profile.id),
    /* Counts your own tools and models. Used only to explain why Developer
       Mode is locked, never to decide anything. */
    supabase.rpc("my_submission_count"),
  ]);

  /* Second round trip on purpose: it needs the ids the first one returned.
     A post on a profile renders liked and saved the way it does in the feed
     rather than blank, which is what a person who just liked it expects. */
  const viewer = await getViewerState(
    supabase,
    user.id,
    (rows.posts ?? []).map((p) => p.id),
  );

  return (
    <AppShell banner={<AccountNotices />} adminLink={<AdminLink />}
      signedIn
    >
      <Container className="max-w-[720px] py-10 sm:py-14">
        {/*
          The way back to the feed. Founder instruction 2026-09-19.

          A profile is reached from a post, an avatar or the nav, and until now
          it had no marked exit: the feed was only reachable through the app
          bar, which reads as navigation rather than as the way back out of
          where you are. Same BackLink every other sub page uses, in the same
          place, with a named destination rather than history.back().
        */}
        <BackLink href="/community" label="Back to the feed" className="mb-6" />

        <ProfileView
          profile={profile}
          isOwner
          viewerSignedIn
          following={false}
          tabs={tabs}
          activeTab={activeTab}
          rows={rows}
          featuredTools={featuredTools}
          viewer={viewer}
          basePath="/profile"
          submissionCount={Number(submissions.data ?? 0)}
        />
      </Container>
    </AppShell>
  );
}
