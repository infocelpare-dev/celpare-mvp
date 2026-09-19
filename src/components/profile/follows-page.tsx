import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { AppShell } from "@/components/app/app-shell";
import { AccountNotices } from "@/components/app/account-notices";
import { AdminLink } from "@/components/app/admin-link";
import { BackLink } from "@/components/ui/back-link";
import { PeopleList } from "@/components/profile/people-list";
import { personName } from "@/lib/format";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  getFollowers,
  getFollowing,
  getProfileByUsername,
  readerFor,
} from "@/lib/profile/queries";

/*
  The two follow lists, one implementation.

  They differ in a query, a heading and an empty sentence, and in nothing else,
  so they are one component rather than two files that drift. The routes stay
  separate because the URLs are separate: /u/<name>/followers is a place, and a
  ?tab= would have made it a state of the profile page instead.

  WHO MAY SEE THIS IS DECIDED IN THE DATABASE, not here. follows_select_all
  admits a row when the reader is either side of it, or when both profiles
  share follows. This page reads through the viewer's own client and renders
  what comes back, so a forged request gets what the policy gives and no more.

  The one thing rendered from OUR side is whether to show the list at all: an
  account that hides its follows gets a sentence saying so rather than an empty
  list, because an empty list is a different statement from a private one.
  D92 is what decides it, and it is deliberately the inverse of the section
  toggles: a public account cannot hide these, and a private one may.
*/

export async function followsMetadata(
  username: string,
  kind: "followers" | "following",
): Promise<Metadata> {
  const title = kind === "followers" ? "Followers" : "Following";
  return {
    title: `${title} of @${username}`,
    /* Not indexed. A list of who follows whom is the social graph, and a
       crawler compiling it across every profile is not what publishing a
       follower count on a page was for. */
    robots: { index: false, follow: false },
  };
}

export async function FollowsPage({
  username,
  kind,
}: {
  username: string;
  kind: "followers" | "following";
}) {
  if (!isSupabaseConfigured()) notFound();

  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  const signedIn = Boolean(user);

  const db = signedIn ? sessionClient : await readerFor(false);
  const profile = await getProfileByUsername(db, username);

  if (!profile) notFound();

  const isOwner = user?.id === profile.id;
  const name = personName(profile);

  /* Mirrors the profile header's own rule, so the counts and the lists cannot
     disagree about whether follows are on show. */
  const showFollows = isOwner || !profile.is_private || profile.show_follows;

  const people = showFollows
    ? kind === "followers"
      ? await getFollowers(db, profile.id)
      : await getFollowing(db, profile.id)
    : [];

  const heading = kind === "followers" ? "Followers" : "Following";

  return (
    <AppShell banner={<AccountNotices />} adminLink={<AdminLink />} signedIn={signedIn}>
      <Container className="max-w-[640px] py-8 sm:py-10">
        <BackLink
          href={`/u/${profile.username}`}
          label={`Back to ${name}`}
          className="mb-5"
        />

        <h1 className="font-display text-[22px] font-semibold">{heading}</h1>
        <p className="mt-1 mb-6 text-[14px] text-muted">
          {name} · @{profile.username}
        </p>

        {showFollows ? (
          <PeopleList
            people={people}
            empty={
              kind === "followers"
                ? isOwner
                  ? "Nobody follows you yet."
                  : `Nobody follows ${name} yet.`
                : isOwner
                  ? "You do not follow anybody yet."
                  : `${name} does not follow anybody yet.`
            }
          />
        ) : (
          <p className="border-t border-border py-10 text-center text-[14px] text-muted">
            This account keeps its follows private.
          </p>
        )}
      </Container>
    </AppShell>
  );
}
