import {
  ModelCard,
  PersonCard,
  PostShelfCard,
  ToolCard,
  TopicCard,
  VideoCard,
} from "./cards";
import type { ExploreItem } from "@/lib/explore/types";
import type { ViewerState } from "@/lib/community/queries";

/*
  One discovery object to the renderer that suits it.

  Section 18 is explicit: do not force everything into one visual card. A tool,
  a person and a post are different things and a single card shape would have to
  drop what makes each one worth looking at. So the union is switched on here,
  in one place, and every shelf and list in Explore renders through this rather
  than growing its own copy of the switch.

  A POST IS THE FEED'S OWN PostCard. Not a summary of one, not a stripped
  version. That is the lesson 4AK.3 already paid for: the profile carried its own
  summary of a post for months, so a video post rendered as a line of text and
  three words. What a post looks like is decided in one file, and this is a
  caller of it.
*/

export type ItemViewer = {
  signedIn: boolean;
  viewerId: string | null;
  /* Which tools and models the viewer has already filed into a collection, and
     who they already follow. Read once per page and passed down, so a shelf of
     eight cards is not eight queries. */
  savedTools: Set<string>;
  savedModels: Set<string>;
  following: Set<string>;
  /* Likes and saves for the posts on screen, in the shape PostCard expects. */
  posts: ViewerState;
};

export function ExploreItemCard({
  item,
  viewer,
  index,
}: {
  item: ExploreItem;
  viewer: ItemViewer;
  /* Position in its shelf. Only the video card uses it, to decide whether it is
     near enough to the front to be worth a poster frame. */
  index: number;
}) {
  switch (item.kind) {
    case "tool":
      return (
        <ToolCard
          tool={item.tool}
          reason={item.reason}
          saved={viewer.savedTools.has(item.tool.id)}
          signedIn={viewer.signedIn}
        />
      );

    case "model":
      return (
        <ModelCard
          model={item.model}
          reason={item.reason}
          saved={viewer.savedModels.has(item.model.id)}
          signedIn={viewer.signedIn}
        />
      );

    case "person":
      return (
        <PersonCard
          person={item.person}
          following={viewer.following.has(item.person.id)}
          signedIn={viewer.signedIn}
          viewerId={viewer.viewerId}
        />
      );

    case "topic":
      return <TopicCard topic={item.topic} />;

    case "video":
      return <VideoCard post={item.post} index={index} />;

    case "post":
      /*
        A post in a SHELF is a tile, not the feed card. Putting PostCard in a
        264px column was the first attempt and a browser showed why it fails:
        three posts at 460px tall beside a 200px tool card, so the row became
        three posts and a sliver. PostShelfCard is the renderer that suits the
        space, and Discussions on the same page still renders the genuine
        PostCard at full width. Section 18.
      */
      return <PostShelfCard post={item.post} />;
  }
}
