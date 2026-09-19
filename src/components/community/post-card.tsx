import Link from "next/link";
import { Link2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/card";
import { hostOf, relativeTime } from "@/lib/format";
import type { FeedPost, ViewerState } from "@/lib/community/queries";
import { PostActions } from "./post-actions";
import { PostAttachment, PostKindBadge, PostMediaGallery } from "./post-media";

/*
  One post in the feed.

  Flat per D11: one hairline border, no shadow, no gradient. The border is a
  bottom rule rather than a box, so a column of posts reads as one list instead
  of a stack of cards, which is what keeps the feed from looking like the
  oversized rounded containers the founder's brief rules out.

  BADGE VERSUS CHIP, from 10-community.md section 9 and the ux guideline. The
  topic on a card is a BADGE: it states a fact about the post and is not
  interactive. The topic row above the feed is CHIPS and every one of them
  navigates. They look alike on purpose and they are different markup, which is
  what stops a badge quietly becoming a dead button.

  There is no post title. `posts` has no title column, so the heading level
  question in section 9 does not arise: the card's own landmark is the author
  link, and the page keeps a single h1.
*/
export function PostCard({
  post,
  viewer,
  signedIn,
}: {
  post: FeedPost;
  viewer: ViewerState;
  signedIn: boolean;
}) {
  const href = `/community/${post.id}`;
  const author = post.author;

  /*
    PEOPLE ARE IDENTIFIED BY @username AND NOTHING ELSE. Founder instruction
    2026-09-19. The real name used to lead the byline and fall back to the
    handle; now the handle is the only thing shown. `full_name` is still stored
    and still comes from an OAuth provider, but no public surface renders it.
  */
  const handle = author?.username ?? null;

  return (
    <article className="border-b border-border px-4 py-4 sm:px-5 sm:py-5">
      <div className="flex gap-3">
        <Link href={author ? `/u/${author.username}` : href} className="shrink-0">
          <Avatar
            username={author?.username}
            avatarUrl={author?.avatar_url}
            size="md"
          />
        </Link>

        <div className="min-w-0 flex-1">
          {/* The byline wraps rather than truncating the name away: at 390px a
              long display name plus a username plus a time does not fit on one
              line, and a name is the one thing here worth a second row. */}
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[14px]">
            {handle ? (
              <Link
                href={`/u/${handle}`}
                className="font-medium text-foreground hover:underline hover:underline-offset-4"
              >
                @{handle}
              </Link>
            ) : (
              <span className="font-medium">Someone</span>
            )}

            <span className="text-[13px] text-muted" aria-hidden>
              ·
            </span>

            {/*
              suppressHydrationWarning, and it is load bearing. relativeTime
              reads the clock, so the server can render "9m ago" and the browser
              hydrate "8m ago" a second later, which makes React throw a
              mismatch and regenerate the subtree. That was a real defect on
              /ask, found in 4O.10. The alternative, freezing the timestamp,
              would stop a value that is supposed to move.
            */}
            <Link
              href={href}
              suppressHydrationWarning
              className="text-[13px] text-muted hover:text-foreground"
            >
              <time dateTime={post.created_at}>{relativeTime(post.created_at)}</time>
            </Link>

            <PostKindBadge kind={post.kind} />

            {post.topic ? (
              <Badge className="text-[11px]">{post.topic.name}</Badge>
            ) : null}
          </div>

          {/*
            whitespace-pre-wrap keeps the author's line breaks, and break-words
            stops one unbroken 200 character string from pushing the whole feed
            sideways at 390px. Rendered as text, never as markup.
          */}
          <p className="mt-1.5 whitespace-pre-wrap break-words text-[15px] leading-relaxed">
            {post.body}
          </p>

          <PostMediaGallery media={post.media} className="mt-3" />

          <PostAttachment tool={post.tool} model={post.model} className="mt-3" />

          {post.link_url ? (
            <a
              href={post.link_url}
              target="_blank"
              /* ugc and nofollow because this is a link a stranger supplied.
                 noopener is what stops the new tab reaching window.opener. */
              rel="noopener noreferrer nofollow ugc"
              className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-[14px] text-foreground transition-colors duration-200 ease-out hover:bg-surface"
            >
              <Link2 className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{hostOf(post.link_url)}</span>
            </a>
          ) : null}

          {/* Only its own author ever sees this, because posts_select_auth is
              what lets them. Being told your post is under review is the least
              somebody is owed, and there is no notification path to tell them
              any other way. */}
          {post.status !== "visible" ? (
            <p className="mt-3 text-[13px] text-muted">
              {post.status === "hidden"
                ? "Hidden while it is reviewed. Only you can see it."
                : "Removed by a moderator. Only you can see it."}
            </p>
          ) : null}

          <PostActions
            postId={post.id}
            href={href}
            likeCount={post.like_count}
            commentCount={post.comment_count}
            saveCount={post.save_count}
            liked={viewer.liked.has(post.id)}
            saved={viewer.saved.has(post.id)}
            signedIn={signedIn}
            /* Pulled left so the icons line up under the body rather than
               under the avatar gutter. */
            className="-ms-3"
          />
        </div>
      </div>
    </article>
  );
}
