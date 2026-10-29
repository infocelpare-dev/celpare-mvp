import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChartNoAxesColumn, Link2 } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { AccountNotices } from "@/components/app/account-notices";
import { AdminLink } from "@/components/app/admin-link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Container } from "@/components/ui/container";
import { BackLink } from "@/components/ui/back-link";
import { IdentityAvatar } from "@/components/community/identity-avatar";
import { IdentityMarks } from "@/components/community/identity-marks";
import { postIdentity } from "@/lib/community/identity";
import { Badge } from "@/components/ui/card";
import { hostOf, relativeTime } from "@/lib/format";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  getPost,
  getViewerState,
  readerFor,
  EMPTY_VIEWER_STATE,
} from "@/lib/community/queries";
import { PostActions } from "@/components/community/post-actions";
import { PostControls } from "@/components/community/post-controls";
import {
  PostAttachment,
  PostKindBadge,
  PostMediaGallery,
} from "@/components/community/post-media";
import { CommentForm } from "@/components/community/comment-form";
import { RankedComments } from "@/components/community/ranked-comments";
import { CommentDebug } from "@/components/community/comment-debug";
import { loadCommentPage } from "@/lib/comments/intelligence/server/engine";
import { getAdminSession } from "@/lib/admin/guard";
import { debugAllowed } from "@/lib/compare/intelligence/debug-gate";
import { SignInButton } from "@/components/auth/sign-in-prompt";

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

  const who = postIdentity(post).name;
  /* The body is somebody else's text going into a meta tag. Trimmed to a
     single line so a description cannot carry newlines, and truncated. */
  const summary = post.body.replace(/\s+/g, " ").slice(0, 155);

  return {
    title: `${who} on Celpare`,
    description: summary,
  };
}

export default async function PostPage({ params, searchParams }: PageProps<"/community/[id]">) {
  const { id } = await params;
  const debugRequested = (await searchParams).debug === "1";

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

  /*
    Comment Intelligence v1 (guide 20): the first page in Top, ranked for this
    viewer. Moderator status decides whether hidden comments are in the pool,
    exactly as comments_select_auth decides it today. The debug rows are built
    only for an admin who asked (?debug=1), and never for anyone else.
  */
  const [moderator, isAdmin] = await Promise.all([
    signedIn ? supabase.rpc("is_moderator").then((r) => r.data === true) : Promise.resolve(false),
    debugRequested && signedIn ? getAdminSession().then((a) => a !== null) : Promise.resolve(false),
  ]);
  const showDebug = debugAllowed({ requested: debugRequested, signedIn, isAdmin });

  const [viewer, comments] = await Promise.all([
    signedIn
      ? getViewerState(supabase, viewerId, [post.id])
      : Promise.resolve(EMPTY_VIEWER_STATE),
    loadCommentPage({
      reader: db,
      post,
      viewerId,
      moderator,
      mode: "top",
      seen: [],
      cursor: null,
      debug: showDebug,
    }),
  ]);

  /* The name, not the handle. Founder instruction 2026-09-19: the @username is
     seen by whoever opens the profile, and nowhere else. A tool's launch shows
     the tool (D203). */
  const who = postIdentity(post);
  const name = who.name;
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
            <Link href={who.href ?? "#"} className="shrink-0">
              <IdentityAvatar identity={who} />
            </Link>

            <div className="min-w-0">
              {/* The h1 of this page is the person, because a post has no
                  title: `posts` has no title column. Nothing skips a level
                  from here down. */}
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="truncate text-[15px] font-medium">
                  {who.href ? (
                    <Link
                      href={who.href}
                      className="hover:underline hover:underline-offset-4"
                    >
                      {name}
                    </Link>
                  ) : (
                    name
                  )}
                </h1>
                <IdentityMarks identity={who} />
              </div>
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

          <PostMediaGallery media={post.media} postId={post.id} className="mt-4" />

          {who.kind === "person" ? (
            <PostAttachment tool={post.tool} model={post.model} className="mt-4" />
          ) : null}

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
            repostCount={post.repost_count}
            viewCount={post.view_count}
            reposted={viewer.reposted.has(post.id)}
            className="-ms-3"
          />

          {/* 4BG: how this post travelled, for its author only (D148). */}
          {isOwner ? (
            <Link
              href={`/community/${post.id}/insights`}
              className="mt-1 inline-flex h-11 items-center gap-1.5 rounded-full px-3 -ms-3 text-[13px] text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChartNoAxesColumn className="size-[18px]" aria-hidden />
              Insights
            </Link>
          ) : null}

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
                <SignInButton className={cn(buttonVariants({ size: "sm" }), "mt-3")}>
                  Create an account
                </SignInButton>
              </div>
            )}
          </div>

          {comments.total === 0 ? (
            <p className="mt-6 text-[14px] text-muted">
              No comments yet.
            </p>
          ) : (
            /*
              THE SAME COMPONENT THE VIDEO SHEET RENDERS. It was a flat <ol>
              written inline here, which could not show a reply under the comment
              it answers once parent_id existed. One thread renderer, two
              surfaces, so a change to how a comment looks cannot land on one and
              miss the other.

              PostControls is not passed down: report and delete live on this
              page for the reason that component already gives, and putting them
              on every node of a deep thread is the icon soup the brief rules
              out.
            */
            <div className="mt-6">
              {/* Keyed on the total, so a new comment posted from the form
                  above (which revalidates this page) starts a fresh first page. */}
              <RankedComments
                key={`${comments.total}`}
                postId={post.id}
                initial={{ ...comments, debug: null, viewerId, signedIn }}
              />
            </div>
          )}

          {comments.debug ? <CommentDebug rows={comments.debug} algorithm={comments.algorithm} /> : null}
        </section>
      </Container>
    </AppShell>
  );
}
