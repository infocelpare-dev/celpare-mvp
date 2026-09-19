import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { AccountNotices } from "@/components/app/account-notices";
import { AdminLink } from "@/components/app/admin-link";
import { BackLink } from "@/components/ui/back-link";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { defaultSort, isSort } from "@/lib/community/ranking";
import {
  countVisiblePosts,
  getFeed,
  getTopicBySlug,
  getViewerState,
  readerFor,
  EMPTY_VIEWER_STATE,
} from "@/lib/community/queries";
import { FeedEmpty } from "@/components/community/feed-empty";
import { DiscoverRail } from "@/components/community/feed-rails";
import { PostCard } from "@/components/community/post-card";
import { CreatePostFab } from "@/components/community/create-post-fab";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/community/topic/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  if (!isSupabaseConfigured()) return { title: "Topic" };

  const topic = await getTopicBySlug(await readerFor(false), slug);
  if (!topic) return { title: "Topic", robots: { index: false, follow: false } };

  return {
    title: `${topic.name} on Celpare`,
    description:
      topic.description ?? `Posts about ${topic.name} in the Celpare community.`,
  };
}

/*
  One topic's posts. The destination behind every topic chip and every topic
  rail row, which is what makes a chip a chip rather than a badge.

  There are no feed tabs here on purpose. For you and Following are two ways of
  choosing WHOSE posts to read, and this page has already chosen WHICH posts,
  so stacking both would give four states where two of them mean nothing.
*/
export default async function TopicPage({
  params,
  searchParams,
}: PageProps<"/community/topic/[slug]">) {
  const { slug } = await params;
  const query = await searchParams;

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

  const [topic, visiblePostCount] = await Promise.all([
    getTopicBySlug(db, slug),
    countVisiblePosts(db),
  ]);

  if (!topic) notFound();

  const requested = typeof query?.sort === "string" ? query.sort : undefined;
  const sort = isSort(requested) ? requested : defaultSort(visiblePostCount);

  const posts = await getFeed(db, {
    sort,
    scope: "for-you",
    viewerId,
    topicId: topic.id,
  });

  const viewer = signedIn
    ? await getViewerState(
        supabase,
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
      <div className="mx-auto flex w-full max-w-[1200px] gap-8 px-4 py-4 sm:px-5 xl:justify-center">

        <div className="min-w-0 flex-1 xl:max-w-[640px]">
          <BackLink href="/community" label="Back to the feed" className="mb-4" />

          <h1 className="font-display text-[22px] font-semibold leading-tight sm:text-[26px]">
            {topic.name}
          </h1>
          {topic.description ? (
            <p className="mt-2 text-[15px] leading-relaxed text-muted">
              {topic.description}
            </p>
          ) : null}

          {posts.length === 0 ? (
            <FeedEmpty scope="for-you" signedIn={signedIn} topicName={topic.name} />
          ) : (
            <ol className="border-t border-border">
              {posts.map((post) => (
                <li key={post.id}>
                  <PostCard post={post} viewer={viewer} signedIn={signedIn} />
                </li>
              ))}
            </ol>
          )}

          <div className="h-24" aria-hidden />
        </div>

        <DiscoverRail />
      </div>

      <CreatePostFab signedIn={signedIn} />
    </AppShell>
  );
}
