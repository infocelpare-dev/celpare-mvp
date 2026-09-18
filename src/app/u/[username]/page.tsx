import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { AppShell } from "@/components/app/app-shell";
import { AccountNotices } from "@/components/app/account-notices";
import { AdminLink } from "@/components/app/admin-link";
import { ProfileView } from "@/components/profile/profile-view";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";
import {
  getFeaturedTools,
  getProfileByUsername,
  getTabRows,
  isFollowing,
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

  const name = profile.full_name?.trim() || profile.username;
  return {
    title: `${name} (@${profile.username})`,
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

  const [rows, featuredTools, following] = await Promise.all([
    getTabRows(db, activeTab, profile, isOwner),
    getFeaturedTools(db, profile.id),
    isFollowing(sessionClient, user?.id ?? null, profile.id),
  ]);

  return (
    <AppShell banner={<AccountNotices />} adminLink={<AdminLink />}
      signedIn={signedIn}
      signOutAction={
        signedIn ? (
          <form action={signOut}>
            <Button variant="outline" size="sm" type="submit">
              Log out
            </Button>
          </form>
        ) : undefined
      }
    >
      <Container className="max-w-[720px] py-10 sm:py-14">
        <ProfileView
          profile={profile}
          isOwner={isOwner}
          viewerSignedIn={signedIn}
          following={following}
          tabs={tabs}
          activeTab={activeTab}
          rows={rows}
          featuredTools={featuredTools}
          basePath={`/u/${profile.username}`}
        />
      </Container>
    </AppShell>
  );
}
