import type { FeedPost } from "@/lib/community/queries";
import { providerLogo } from "@/lib/models/provider-logo";
import { personName } from "@/lib/format";

/*
  Who a post is FROM, for display (D203).

  A person's post shows the person. A tool's launch (posted_as 'tool') shows the
  tool: its name, its logo and its page, the way a company page posts on
  LinkedIn. A model's post would show the model the same way. author_id is
  still the developer in every case, which is what ownership, delete,
  insights and notifications read; this only decides the byline.

  Falls back to the person whenever the tool or model did not load, so a post
  never renders without a name.
*/
export type PostIdentity = {
  kind: "person" | "tool" | "model";
  name: string;
  href: string | null;
  imageUrl: string | null;
  /* For the person avatar's initials. */
  username: string | null;
  fullName: string | null;
  /* A verified tool's blue tick (D201). A person or a model has none. */
  verified: boolean;
};

export function postIdentity(post: Pick<FeedPost, "posted_as" | "tool" | "model" | "author">): PostIdentity {
  if (post.posted_as === "tool" && post.tool) {
    return {
      kind: "tool",
      name: post.tool.name,
      href: `/tools/${post.tool.slug}`,
      imageUrl: post.tool.logo_url,
      username: null,
      fullName: post.tool.name,
      verified: Boolean(post.tool.verified),
    };
  }
  if (post.posted_as === "model" && post.model) {
    return {
      kind: "model",
      name: post.model.name,
      href: `/models/${post.model.slug}`,
      imageUrl: providerLogo(post.model.provider),
      username: null,
      fullName: post.model.name,
      verified: false,
    };
  }
  const author = post.author;
  return {
    kind: "person",
    name: author ? personName(author) : "Someone",
    href: author ? `/u/${author.username}` : null,
    imageUrl: author?.avatar_url ?? null,
    username: author?.username ?? null,
    fullName: author?.full_name ?? null,
    verified: false,
  };
}
