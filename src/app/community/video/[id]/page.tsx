import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { getViewerState, readerFor } from "@/lib/community/queries";
import { getVideoViewerState, toVideoPosts } from "@/lib/community/video";
import { getReelsFeed } from "@/lib/community/intelligence/server/engine";
import { SEEN_COOKIE } from "@/lib/community/intelligence/seen";
import { cookies } from "next/headers";
import { VideoFeed } from "@/components/community/video/video-feed";

/* Reads the session cookie, so it must never be prerendered. */
export const dynamic = "force-dynamic";

/*
  The vertical video viewer, at a URL of its own.

  A ROUTE RATHER THAN A MODAL OVER THE FEED, for four reasons that all matter.
  Back works, and works with the phone's back gesture rather than only with a
  button. The address is shareable, so a video somebody sends opens on that
  video. Next restores the feed's scroll position on the way back, which a modal
  would have to reimplement. And the feed page stays exactly what it was, which
  is the brief's first integration rule: do not replace the normal feed.

  IT READS THROUGH readerFor, so a signed out visitor gets anon's policies and
  nothing is widened for this surface. The feed is public (D32) and so is
  watching it.

  THE LIST IS BUILT HERE AND HANDED DOWN. The player takes videoPosts[] and has
  no idea where they came from, so replacing this one call with a ranker later
  changes nothing below it.
*/

export const metadata: Metadata = {
  title: { absolute: "Videos on Celpare" },
  /* Not indexed. A viewer URL is a position in a list that changes, so what a
     crawler saw would not be what a visitor gets. The post's own page at
     /community/[id] is the indexable one, and it is canonical for this content. */
  robots: { index: false, follow: true },
};

export default async function VideoViewerPage({ params }: PageProps<"/community/video/[id]">) {
  const { id } = await params;

  if (!isSupabaseConfigured()) notFound();

  let signedIn = false;
  let viewerId: string | null = null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  signedIn = Boolean(user);
  viewerId = user?.id ?? null;

  const db = await readerFor(signedIn);
  /* reels_v1 (src/lib/community/intelligence/reels.ts): the requested video
     first, then a session sequence ranked by watching. The player below is
     unchanged; it receives the same VideoPost[] it always did. */
  const seenCookie = (await cookies()).get(SEEN_COOKIE)?.value ?? null;
  const reels = await getReelsFeed({ db, viewerId, pages: 1, firstId: id, seenCookie });
  const posts = toVideoPosts(reels.posts);

  /* The requested video is put first by the query, so an empty list here means
     it does not exist, is not visible, or carries no video. All three are the
     same answer: there is nothing at this address. */
  if (posts.length === 0 || posts[0]?.id !== id) notFound();

  /* Two reads, issued together. The second is the viewer's own reposts and
     follows, which the feed does not need and therefore does not pay for. */
  const [viewer, extra] = await Promise.all([
    getViewerState(
      db,
      viewerId,
      posts.map((p) => p.id),
    ),
    getVideoViewerState(db, viewerId, posts),
  ]);

  return (
    <VideoFeed
      posts={posts}
      liked={[...viewer.liked]}
      saved={[...viewer.saved]}
      reposted={[...extra.reposted]}
      following={[...extra.following]}
      viewerId={viewerId}
      signedIn={signedIn}
      source="video"
      backHref="/community"
    />
  );
}
