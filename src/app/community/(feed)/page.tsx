import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import { AccountNotices } from "@/components/app/account-notices";
import { AdminLink } from "@/components/app/admin-link";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { defaultSort, isSort } from "@/lib/community/ranking";
import {
  countVisiblePosts,
  getFeed,
  getTopics,
  getViewerState,
  readerFor,
  EMPTY_VIEWER_STATE,
  type FeedScope,
} from "@/lib/community/queries";
import { FeedHeader } from "@/components/community/feed-header";
import { unreadThreadCount } from "@/lib/messages/queries";
import { FeedEmpty } from "@/components/community/feed-empty";
import { DiscoverRail } from "@/components/community/feed-rails";
import { PostCard } from "@/components/community/post-card";
import { CreatePostFab } from "@/components/community/create-post-fab";
import { FeedEnd } from "@/components/community/feed-end";
import { RANKING } from "@/lib/community/ranking";

export const metadata: Metadata = {
  title: { absolute: "Celpare Community" },
  description:
    "What people are building with AI tools. Ask which tool fits, share what you found, post what you shipped.",
};

/* Reads the session cookie, so it must never be prerendered. */
export const dynamic = "force-dynamic";

/*
  The Celpare homepage for a signed in person (D27), and a public page for
  everybody else (D32).

  Rebuilt on 2026-09-19 from the founder's feed brief. What used to be here was
  an honest placeholder saying the feed was not built. It is built now, so the
  placeholder is gone rather than being kept beside it.

  THE FEED IS PUBLICLY READABLE AND A SIGNED OUT VISITOR READS IT THROUGH THE
  ANON CLIENT. That is the same path a crawler takes, so what is verified is
  the policy anon actually gets rather than a session that happens to be
  around. readerFor() is the whole of that decision.
*/
export default async function CommunityPage({
  searchParams,
}: PageProps<"/community">) {
  const params = await searchParams;

  const scope: FeedScope =
    params?.feed === "following" ? "following" : "for-you";

  let signedIn = false;
  let viewerId: string | null = null;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    signedIn = Boolean(user);
    viewerId = user?.id ?? null;
  }

  const db = await readerFor(signedIn);

  /* The count decides the DEFAULT sort and whether the sort control is worth
     showing at all. D29: New until there is enough content for ranking to mean
     anything, as a runtime check rather than a hardcoded switch. */
  const [topics, visiblePostCount] = await Promise.all([
    getTopics(db),
    countVisiblePosts(db),
  ]);

  const requested = typeof params?.sort === "string" ? params.sort : undefined;
  const sort = isSort(requested) ? requested : defaultSort(visiblePostCount);

  const posts = await getFeed(db, { sort, scope, viewerId });

  /* Signed out people have no messages and no grant to read any, so this is
     skipped entirely rather than asked and answered with zero. */
  const unreadMessages = signedIn && viewerId
    ? await unreadThreadCount(await createClient())
    : 0;

  /*
    Likes and saves are read with the SIGNED IN client even though the feed
    itself may have been read as anon. They are the viewer's own private rows
    and there is no cross user select policy on either table, so this returns
    nothing at all when signed out, which is exactly what EMPTY_VIEWER_STATE
    already says.
  */
  const viewer = signedIn
    ? await getViewerState(
        await createClient(),
        viewerId,
        posts.map((p) => p.id),
      )
    : EMPTY_VIEWER_STATE;

  return (
    <AppShell
      banner={<AccountNotices />}
      adminLink={<AdminLink />}
      signedIn={signedIn}
    >
      {/*
        The three column frame. It is a centred flex row rather than a grid of
        fixed tracks, so the two rails simply are not in the layout below xl
        instead of collapsing to zero width tracks that still take part in
        sizing. The middle column is max-w-[640px] at every width, which is the
        measure 10-community.md section 9 asks for and the reason the feed does
        not stretch to 1440 on a desktop.
      */}
      <div className="mx-auto flex w-full max-w-[1200px] gap-8 px-4 py-4 sm:px-5 xl:justify-center">

        <div className="min-w-0 flex-1 xl:max-w-[640px]">
          <h1 id="top" className="sr-only">Celpare Community</h1>

          {/* The topics live INSIDE this control, opened from the chevron on
              For you, not as a row under it. Founder instruction 2026-09-19. */}
          <FeedHeader
            scope={scope}
            sort={sort}
            visiblePostCount={visiblePostCount}
            topics={topics}
            unreadMessages={unreadMessages}
          />

          {posts.length === 0 ? (
            <FeedEmpty scope={scope} signedIn={signedIn} />
          ) : (
            /*
              A plain list of articles with a hairline between them. No
              wrapper card per post: a card inside a card is the oversized
              rounded container the brief rules out, and D11 wants one
              hairline rather than a stack of boxes.
            */
            <>
              <ol className="border-t border-border">
                {posts.map((post) => (
                  <li key={post.id}>
                    <PostCard post={post} viewer={viewer} signedIn={signedIn} />
                  </li>
                ))}
              </ol>

              {/*
                The end of the feed, said out loud, with the composer at the
                point where somebody is most likely to want it.

                `complete` is the one honest test for "there is no more": the
                query asked for PAGE_SIZE and came back with fewer. A full page
                means there may well be more that was never fetched, and saying
                you have reached the end then would be a claim about the whole
                community based on a LIMIT clause.
              */}
              <FeedEnd
                complete={posts.length < RANKING.PAGE_SIZE}
                signedIn={signedIn}
                scope={scope}
              />
            </>
          )}

          {/* Clears the floating button, so the last post can always be
              scrolled out from under it. */}
          <div className="h-24" aria-hidden />
        </div>

        <DiscoverRail />
      </div>

      <CreatePostFab signedIn={signedIn} />
    </AppShell>
  );
}
