import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import { AccountNotices } from "@/components/app/account-notices";
import { AdminLink } from "@/components/app/admin-link";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { isSort } from "@/lib/community/ranking";
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
import type { FeedPost } from "@/lib/community/queries";
import { FeedItem, FeedTelemetry } from "@/components/community/feed-intelligence";
import {
  getAlgorithmEvaluation,
  getFollowingFeed,
  getForYouFeed,
  type RankedFeed,
} from "@/lib/community/intelligence/server/engine";
import { FEED } from "@/lib/community/intelligence/feed";
import { SEEN_COOKIE, expectedReadMs } from "@/lib/community/intelligence/seen";
import { getAdminSession } from "@/lib/admin/guard";
import { FeedDebugItem, FeedDebugSummary } from "@/components/community/feed-debug";
import { cookies } from "next/headers";

/* feed_v3 dwell cap input: how long this card takes to read. */
function readMsOf(post: FeedPost): number {
  const words = (post.body ?? "").split(/\s+/).filter(Boolean).length;
  const media = post.media.some((m) => m.media_kind === "video")
    ? "video"
    : post.media.some((m) => m.media_kind === "image")
      ? "image"
      : "text";
  return expectedReadMs(words, media);
}

/* ?more=N renders the first N pages. Bounded, so a URL cannot ask for a
   thousand posts. */
function pagesFrom(value: unknown): number {
  const n = typeof value === "string" ? Number.parseInt(value, 10) : 1;
  return Number.isFinite(n) ? Math.min(Math.max(1, n), FEED.MAX_PAGES) : 1;
}

/* The ranking clock, frozen by the first page and carried by Show more so the
   order of what is already on screen does not shift under the reader. Only
   honoured within two hours; anything else is a stale or edited link. */
function frozenNow(value: unknown): number {
  const now = Date.now();
  const at = typeof value === "string" ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(at) && at <= now && now - at < 2 * 3_600_000 ? at : now;
}

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
  /* Ranked by default (founder, 2026-09-24, D133, superseding D29's "New until
     20 posts"): For you and Following open on the algorithm. Latest stays one
     tap away for anybody who wants newest first. */
  const sort = isSort(requested) ? requested : "top";

  const pages = pagesFrom(params?.more);

  /*
    TOP IS COMMUNITY INTELLIGENCE: feed_v1 for For you, following_v1 for
    Following (src/lib/community/intelligence). LATEST stays exactly what it
    says, newest first with no ranking, and remains the default until there is
    enough content for ranking to mean anything (D29).
  */
  let posts: FeedPost[];
  let ranked: RankedFeed | null = null;
  const now = frozenNow(params?.at);
  /* Admins can append ?debug=1 to see why each post ranked where it did. Both
     conditions are checked here, on the server; nobody else ever gets the data. */
  const debug = params?.debug === "1" && signedIn && (await getAdminSession()) !== null;

  if (sort === "top") {
    /* What this browser just had on screen (seen.ts). Read here so a refresh
       knows at once, without waiting for the impression beacon to land. */
    const seenCookie = (await cookies()).get(SEEN_COOKIE)?.value ?? null;
    const request = { db, viewerId, pages, now, seenCookie, debug };
    ranked = scope === "following" ? await getFollowingFeed(request) : await getForYouFeed(request);
    posts = ranked.posts;
  } else {
    posts = await getFeed(db, { sort, scope, viewerId, pages });
  }

  const complete = ranked ? ranked.complete : posts.length < RANKING.PAGE_SIZE * pages;

  /* Only asked when Following came back empty, so the empty state can tell
     "you follow nobody" from "the people you follow have not posted". */
  let followsAnyone = false;
  if (scope === "following" && posts.length === 0 && viewerId) {
    const { count } = await db
      .from("follows")
      .select("following_id", { count: "exact", head: true })
      .eq("follower_id", viewerId);
    followsAnyone = (count ?? 0) > 0;
  }
  const moreHref =
    !complete && pages < FEED.MAX_PAGES
      ? `/community?${new URLSearchParams({
          ...(scope === "following" ? { feed: "following" } : {}),
          sort,
          more: String(pages + 1),
          ...(ranked ? { at: String(now) } : {}),
          ...(debug ? { debug: "1" } : {}),
        }).toString()}#p-${pages * RANKING.PAGE_SIZE}`
      : null;

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
            <FeedEmpty scope={scope} signedIn={signedIn} followsAnyone={followsAnyone} />
          ) : (
            /*
              A plain list of articles with a hairline between them. No
              wrapper card per post: a card inside a card is the oversized
              rounded container the brief rules out, and D11 wants one
              hairline rather than a stack of boxes.
            */
            <>
              {/*
                FeedTelemetry and FeedItem record what was shown, opened and
                read, with the algorithm and reason that placed it, so the next
                ranking learns from this one. They render no chrome of their
                own; a post collapses only when its reader says not interested.
              */}
              <FeedTelemetry
                surface={scope === "following" ? "following" : "for_you"}
                algorithm={ranked?.algorithm ?? null}
                variant={ranked?.variant ?? null}
                servedKey={String(now)}
              >
                {ranked?.debug ? (
                  <FeedDebugSummary
                    debug={ranked.debug}
                    algorithm={ranked.algorithm}
                    variant={ranked.variant}
                    evaluation={await getAlgorithmEvaluation(7)}
                    why={typeof params?.why === "string" && /^[0-9a-f-]{36}$/.test(params.why) ? params.why : null}
                  />
                ) : null}
                <ol className="border-t border-border">
                  {posts.map((post, index) => (
                    <li key={post.id} id={`p-${index}`}>
                      <FeedItem
                        postId={post.id}
                        position={index}
                        reason={ranked?.reasons[post.id] ?? null}
                        expectedReadMs={readMsOf(post)}
                      >
                        <PostCard
                          post={post}
                          viewer={viewer}
                          signedIn={signedIn}
                          feedback={Boolean(ranked)}
                          socialProof={ranked?.socialProof[post.id] ?? null}
                        />
                      </FeedItem>
                      {ranked?.debug ? <FeedDebugItem entry={ranked.debug.items[post.id]} now={now} /> : null}
                    </li>
                  ))}
                </ol>
              </FeedTelemetry>

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
                complete={complete}
                signedIn={signedIn}
                scope={scope}
                moreHref={moreHref}
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
