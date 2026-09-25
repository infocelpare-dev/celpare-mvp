import { MessagesSquare, UserPlus } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import type { FeedScope } from "@/lib/community/queries";

/*
  The empty state, which at launch is the state most visitors will see. It gets
  real design rather than a centred grey sentence, per 10-community.md section
  9, and it never fakes activity (D30).

  Three different emptinesses, because they mean three different things and one
  message for all of them would be wrong twice:

  - For you, with nothing posted yet. The place is new. Say so, say what it is
    for, and give the one action that helps.
  - Following, with nobody followed. Not the same as nothing existing. The feed
    is empty by construction and the fix is to follow somebody, so the button
    goes to the feed rather than to the composer.
  - Following, where the people followed have not posted recently. Telling
    that person they follow nobody would be false, so it says what is true.
  - A topic with nothing in it. The other topics still have things in them.

  No fallback to "popular posts" and no borrowed content. An empty feed that
  quietly shows something else teaches people the tab does not mean what it
  says, which is the mistake the tool search made once already.
*/
export function FeedEmpty({
  scope,
  signedIn,
  topicName,
  followsAnyone,
}: {
  scope: FeedScope;
  signedIn: boolean;
  topicName?: string;
  /* Following only: whether the reader follows at least one account. */
  followsAnyone?: boolean;
}) {
  if (topicName) {
    return (
      <Shell icon={<MessagesSquare className="size-6 text-muted" aria-hidden />}>
        <Title>Nothing in {topicName} yet</Title>
        <Body>
          No one has posted under this topic. If you have something that belongs
          here, it would be the first.
        </Body>
        {signedIn ? (
          <Action href="/community/new" label="Write a post" />
        ) : (
          <Action href="/get-started" label="Create an account" />
        )}
      </Shell>
    );
  }

  if (scope === "following" && followsAnyone) {
    return (
      <Shell icon={<UserPlus className="size-6 text-muted" aria-hidden />}>
        <Title>Nothing new from the people you follow</Title>
        <Body>
          The people you follow have not posted in the last month. Follow a few
          more from the main feed to see more here.
        </Body>
        <Action href="/community" label="Back to For you" />
      </Shell>
    );
  }

  if (scope === "following") {
    return (
      <Shell icon={<UserPlus className="size-6 text-muted" aria-hidden />}>
        <Title>Your Following feed is empty</Title>
        <Body>
          This shows posts from people you follow, and you are not following
          anybody yet. Find somebody in the main feed and follow them from their
          profile.
        </Body>
        <Action href="/community" label="Back to For you" />
      </Shell>
    );
  }

  return (
    <Shell icon={<MessagesSquare className="size-6 text-muted" aria-hidden />}>
      <Title>Nobody has posted yet</Title>
      <Body>
        Celpare Community is where people share what they found, ask which tool
        fits, and post what they shipped. It is brand new, so there is nothing
        here yet, and nothing here is standing in for posts that do not exist.
      </Body>
      {signedIn ? (
        <Action href="/community/new" label="Write the first post" />
      ) : (
        <>
          <Action href="/get-started" label="Create an account" />
          <p className="mt-4 text-[13px] text-muted">
            You can read the feed without one. Posting needs an account so a
            post has an author.
          </p>
        </>
      )}
    </Shell>
  );
}

function Shell({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="px-4 py-14 text-center sm:px-6 sm:py-20">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full border border-border">
        {icon}
      </div>
      {children}
    </div>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-5 font-display text-[19px] font-semibold">{children}</h2>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return (
    <p className="mx-auto mt-2.5 max-w-[46ch] text-[15px] leading-relaxed text-muted">
      {children}
    </p>
  );
}

function Action({ href, label }: { href: string; label: string }) {
  return (
    <div className="mt-6">
      <ButtonLink href={href}>{label}</ButtonLink>
    </div>
  );
}
