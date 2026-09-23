import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { personName } from "@/lib/format";
import { getViewerState } from "@/lib/community/queries";
import { BackLink } from "@/components/ui/back-link";
import { AppShell } from "@/components/app/app-shell";
import { AccountNotices } from "@/components/app/account-notices";
import { AdminLink } from "@/components/app/admin-link";
import { ProfileView } from "@/components/profile/profile-view";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  getFeaturedTools,
  getProfileByUsername,
  getTabRows,
  isFollowing,
  followsViewer,
  isTabKey,
  readerFor,
  visibleTabs,
} from "@/lib/profile/queries";

export const dynamic = "force-dynamic";

/*
  The public profile. Readable signed out, per D32, and this is the one that is
  meant to be found: it is what makes a post shareable to somebody who has no
  account yet.

  A signed out visitor reads through the anon client, which is the same path a
  crawler takes, so what is rendered here is exactly what anon policy allows
  rather than whatever a stray session would have permitted. `email` is not in
  the SELECT grant at all, so it cannot reach this page even by mistake.
*/

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  if (!isSupabaseConfigured()) return { title: "Profile" };

  const { username } = await params;
  const db = await readerFor(false);
  const profile = await getProfileByUsername(db, username);

  if (!profile) return { title: "Profile not found", robots: { index: false } };

  /* The name, then the handle. It read "@ameagmahad (@ameagmahad)" while the
     handle was the only identity, which is a title that says one thing twice
     and names the person once. */
  const name = personName(profile);
  return {
    title: name === `@${profile.username}` ? name : `${name} (@${profile.username})`,
    // The bio is written by the person. It is fine as a description, and it is
    // never treated as instructions anywhere, here or in a prompt.
    description: profile.bio?.slice(0, 200) ?? `${name} on Celpare.`,
    alternates: { canonical: `/u/${profile.username}` },
  };
}

export default async function PublicProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  if (!isSupabaseConfigured()) notFound();

  const { username } = await params;

  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  const signedIn = Boolean(user);

  const db = signedIn ? sessionClient : await readerFor(false);
  const profile = await getProfileByUsername(db, username);

  if (!profile) notFound();

  // Landing on your own public page should behave like your own page, so the
  // owner tabs and the Edit control appear rather than a Follow button
  // pointing at yourself.
  const isOwner = user?.id === profile.id;

  const tabs = visibleTabs(isOwner, profile);
  const search = await searchParams;
  const activeTab = isTabKey(search.tab, tabs) ? search.tab : "posts";

  const [rows, featuredTools, following, followsYou] = await Promise.all([
    getTabRows(db, activeTab, profile, isOwner),
    getFeaturedTools(db, profile.id),
    isFollowing(sessionClient, user?.id ?? null, profile.id),
    followsViewer(sessionClient, user?.id ?? null, profile.id),
  ]);

  /* Read through the SESSION client, never the anon one: this is what the
     viewer has liked and saved, which is nobody's business but theirs.
     getViewerState returns an empty set for a signed out visitor rather than
     asking at all. */
  const viewer = await getViewerState(
    sessionClient,
    user?.id ?? null,
    (rows.posts ?? []).map((p) => p.id),
  );

  return (
    <AppShell banner={<AccountNotices />} adminLink={<AdminLink />}
      signedIn={signedIn}
    >
      <Container className="max-w-[720px] py-10 sm:py-14">
        {/* The way back to the feed, founder instruction 2026-09-19. Public,
            because the feed is (D32), so a signed out visitor who landed here
            from a post has the same exit. */}
        <BackLink href="/community" label="Back to the feed" className="mb-6" />

        <ProfileView
          profile={profile}
          isOwner={isOwner}
          viewerSignedIn={signedIn}
          following={following}
          followsYou={followsYou}
          tabs={tabs}
          activeTab={activeTab}
          rows={rows}
          featuredTools={featuredTools}
          viewer={viewer}
          basePath={`/u/${profile.username}`}
        />
      </Container>
    </AppShell>
  );
}
