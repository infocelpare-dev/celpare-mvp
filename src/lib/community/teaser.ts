import type { FeedPost } from "./queries";

/*
  A few recent posts shown under the empty Ask chat (D267, 2026-11-12). Ask is
  the home now and the feed is second; this keeps the community in view
  without making it the front door.

  Plain strings only: AskChat is a client component, so nothing that cannot be
  serialised crosses into it (a React component never does). No counts, no
  media and no impression events: these are links to posts, not a feed view
  (D129), so opening /ask never records anybody as having seen a post.

  The byline comes in as nameOf (the page passes postIdentity, D203) so this
  stays free of path aliases and runs under the plain node test loader.
*/
export type CommunityTeaser = {
  id: string;
  href: string;
  name: string;
  excerpt: string;
  createdAt: string;
};

export const TEASER_COUNT = 3;
const EXCERPT_CHARS = 160;

export function toTeasers(
  posts: FeedPost[],
  nameOf: (post: FeedPost) => string,
  count = TEASER_COUNT,
): CommunityTeaser[] {
  return posts
    .map((p) => ({ post: p, text: p.body.replace(/\s+/g, " ").trim() }))
    // A post that is only media or a link has nothing to quote here.
    .filter(({ text }) => text.length > 0)
    .slice(0, count)
    .map(({ post, text }) => ({
      id: post.id,
      href: `/community/${post.id}`,
      name: nameOf(post),
      excerpt: text.length > EXCERPT_CHARS ? `${text.slice(0, EXCERPT_CHARS - 1).trimEnd()}…` : text,
      createdAt: post.created_at,
    }));
}
