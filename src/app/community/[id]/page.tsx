import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Link2 } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { AccountNotices } from "@/components/app/account-notices";
import { AdminLink } from "@/components/app/admin-link";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { BackLink } from "@/components/ui/back-link";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/card";
import { hostOf, personName, relativeTime } from "@/lib/format";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  getComments,
  getLikedComments,
  getPost,
  getViewerState,
  readerFor,
  EMPTY_VIEWER_STATE,
} from "@/lib/community/queries";
import { PostActions, CommentLike } from "@/components/community/post-actions";
import { PostControls } from "@/components/community/post-controls";
import {
  PostAttachment,
  PostKindBadge,
  PostMediaGallery,
} from "@/components/community/post-media";
import { CommentForm } from "@/components/community/comment-form";

export const dynamic = "force-dynamic";

/*
  A post and its comments. Public (D32), so this is a shareable, indexable page
  from the very first post, which is one of the four answers to the cold start
  in 10-community.md section 11.
*/
export async function generateMetadata({
  params,
}: PageProps<"/community/[id]">): Promise<Metadata> {
  const { id } = await params;

  if (!isSupabaseConfigured()) return { title: "Post" };

  const db = await readerFor(false);
  const post = await getPost(db, id);

  if (!post || post.status !== "visible") {
    /* A hidden or missing post gets no description and is not indexed. */
    return { title: "Post", robots: { index: false, follow: false } };
  }

  const who = post.author ? personName(post.author) : "Someone";
  /* The body is somebody else's text going into a meta tag. Trimmed to a
     single line so a description cannot carry newlines, and truncated. */
  const summary = post.body.replace(/\s+/g, " ").slice(0, 155);

  return {
    title: `${who} on Celpare`,
    description: summary,
  };
}

export default async function PostPage({ params }: PageProps<"/community/[id]">) {
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
  const post = await getPost(db, id);

  /*
    Null covers three different things and deliberately answers all of them the
    same way: the post never existed, it was soft deleted, or the policy will
    not show it to this viewer because it is hidden, removed, or its author is
    private. Distinguishing them in the response would leak which.
  */
  if (!post) notFound();

  const comments = await getComments(db, post.id);

  const [viewer, likedComments] = await Promise.all([
    signedIn
      ? getViewerState(supabase, viewerId, [post.id])
      : Promise.resolve(EMPTY_VIEWER_STATE),
    signedIn
      ? getLikedComments(
          supabase,
          viewerId,
          comments.map((c) => c.id),
        )
      : Promise.resolve(new Set<string>()),
  ]);

  const author = post.author;
  const handle = author?.username ?? null;
  /* The name, not the handle. Founder instruction 2026-09-19: the @username is
     seen by whoever opens the profile, and nowhere else. */
  const name = author ? personName(author) : "Someone";
  const isOwner = Boolean(viewerId && viewerId === post.author_id);

  return (
    <AppShell
      banner={<AccountNotices />}
      adminLink={<AdminLink />}
      signedIn={signedIn}
    >
      <Container className="max-w-[640px] py-5 sm:py-8">
        <BackLink href="/community" label="Back to the feed" className="mb-5" />

        <article>
          <div className="flex items-center gap-3">
            <Link href={handle ? `/u/${handle}` : "#"} className="shrink-0">
              <Avatar
                fullName={author?.full_name}
                username={author?.username}
                avatarUrl={author?.avatar_url}
                size="md"
              />
            </Link>

            <div className="min-w-0">
              {/* The h1 of this page is the person, because a post has no
                  title: `posts` has no title column. Nothing skips a level
                  from here down. */}
              <h1 className="truncate text-[15px] font-medium">
                {handle ? (
                  <Link
                    href={`/u/${handle}`}
                    className="hover:underline hover:underline-offset-4"
                  >
                    {name}
                  </Link>
                ) : (
                  name
                )}
              </h1>
              <p className="text-[13px] text-muted" suppressHydrationWarning>
                <time dateTime={post.created_at}>
                  {relativeTime(post.created_at)}
                </time>
              </p>
            </div>

            <span className="ms-auto flex shrink-0 items-center gap-2">
            <PostKindBadge kind={post.kind} />
            {post.topic ? (
              <Link href={`/community/topic/${post.topic.slug}`}>
                {/* A chip here, not a badge: on this page it navigates. */}
                <Badge className="hover:bg-surface">{post.topic.name}</Badge>
              </Link>
            ) : null}
            </span>
          </div>

          <p className="mt-4 whitespace-pre-wrap break-words text-[16px] leading-relaxed">
            {post.body}
          </p>

          <PostMediaGallery media={post.media} className="mt-4" />

          <PostAttachment tool={post.tool} model={post.model} className="mt-4" />

          {post.link_url ? (
            <a
              href={post.link_url}
              target="_blank"
              rel="noopener noreferrer nofollow ugc"
              className="mt-4 inline-flex max-w-full items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-[14px] transition-colors duration-200 ease-out hover:bg-surface"
            >
              <Link2 className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{hostOf(post.link_url)}</span>
            </a>
          ) : null}

          {post.status !== "visible" ? (
            <p className="mt-4 rounded-xl border border-border bg-surface px-4 py-3 text-[14px] leading-relaxed">
              {post.status === "hidden"
                ? "This post is hidden while it is reviewed. Only you can see it."
                : "This post was removed by a moderator. Only you can see it."}
            </p>
          ) : null}

          <PostActions
            postId={post.id}
            href={`/community/${post.id}`}
            likeCount={post.like_count}
            commentCount={post.comment_count}
            saveCount={post.save_count}
            liked={viewer.liked.has(post.id)}
            saved={viewer.saved.has(post.id)}
            signedIn={signedIn}
            className="-ms-3"
          />

          {isOwner || signedIn ? (
            <PostControls
              entityType="post"
              entityId={post.id}
              postId={post.id}
              isOwner={isOwner}
              signedIn={signedIn}
            />
          ) : null}
        </article>

        <section aria-labelledby="comments-heading" className="mt-8">
          <h2 id="comments-heading" className="font-display text-[17px] font-semibold">
            {post.comment_count > 0
              ? `${post.comment_count} ${post.comment_count === 1 ? "comment" : "comments"}`
              : "Comments"}
          </h2>

          <div className="mt-4">
            {signedIn ? (
              <CommentForm postId={post.id} />
            ) : (
              <div className="rounded-xl border border-border px-4 py-4">
                <p className="text-[14px] leading-relaxed text-muted">
                  Reading needs no account. Commenting does, so a comment has an
                  author.
                </p>
                <ButtonLink href="/get-started" size="sm" className="mt-3">
                  Create an account
                </ButtonLink>
              </div>
            )}
          </div>

          {comments.length === 0 ? (
            <p className="mt-6 text-[14px] text-muted">
              No comments yet.
            </p>
          ) : (
            <ol className="mt-6 space-y-5">
              {comments.map((comment) => {
                const cAuthor = comment.author;
                const cHandle = cAuthor?.username ?? null;
                const cName = cAuthor ? personName(cAuthor) : "Someone";
                const cIsOwner = Boolean(viewerId && viewerId === comment.author_id);

                return (
                  <li key={comment.id} className="border-t border-border pt-5">
                    <div className="flex gap-3">
                      <Avatar
                        fullName={cAuthor?.full_name}
                        username={cAuthor?.username}
                        avatarUrl={cAuthor?.avatar_url}
                        size="sm"
                        className="shrink-0"
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 text-[14px]">
                          {cHandle ? (
                            <Link
                              href={`/u/${cHandle}`}
                              className="font-medium hover:underline hover:underline-offset-4"
                            >
                              {cName}
                            </Link>
                          ) : (
                            <span className="font-medium">{cName}</span>
                          )}
                          <span className="text-[13px] text-muted" suppressHydrationWarning>
                            <time dateTime={comment.created_at}>
                              {relativeTime(comment.created_at)}
                            </time>
                          </span>
                        </div>

                        <p className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-relaxed">
                          {comment.body}
                        </p>

                        <div className="-ms-3 mt-1 flex items-center gap-2">
                          <CommentLike
                            commentId={comment.id}
                            likeCount={comment.like_count}
                            liked={likedComments.has(comment.id)}
                            signedIn={signedIn}
                          />
                        </div>

                        {signedIn ? (
                          <PostControls
                            entityType="comment"
                            entityId={comment.id}
                            postId={post.id}
                            isOwner={cIsOwner}
                            signedIn={signedIn}
                          />
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </Container>
    </AppShell>
  );
}
