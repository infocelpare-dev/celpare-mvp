import { ArrowUp, CheckCheck, PenLine } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { EndOfList } from "@/components/ui/end-of-list";
import type { FeedScope } from "@/lib/community/queries";

/*
  The bottom of the feed.

  TWO DIFFERENT SENTENCES, AND THE DIFFERENCE IS NOT COSMETIC. The feed query is
  capped at one page and there is no pagination yet, so a full page of results
  means there may well be more posts that simply were not fetched. Telling
  somebody they have reached the end at that moment is a claim about the whole
  community made on the strength of a LIMIT clause, and it is the same family of
  mistake as D99: stating a fact about the platform when all you know is what one
  query returned.

  So the caller passes `complete`, which is true only when the query came back
  with fewer rows than it asked for. That is the one condition under which "you
  have seen everything" is actually true, whatever the scope or the topic.

  THE COMPOSER IS HERE AS A REAL BUTTON, not only as the floating icon. Founder
  instruction: somebody who has read to the end of the feed is the person most
  likely to have something to add, and a 56px circle with no words is a control
  you have to already know. A labelled button at the point of intent costs one
  line and says what it does.

  A signed out visitor gets the gate rather than a button that would fail, which
  is the rule the FAB and every Follow button already follow.
*/
export function FeedEnd({
  complete,
  signedIn,
  scope,
  topicName,
}: {
  complete: boolean;
  signedIn: boolean;
  scope: FeedScope;
  topicName?: string;
}) {
  const where = topicName
    ? topicName
    : scope === "following"
      ? "the people you follow"
      : "Celpare";

  return (
    <EndOfList
      icon={
        complete ? (
          <CheckCheck className="size-5" aria-hidden />
        ) : (
          <PenLine className="size-5" aria-hidden />
        )
      }
      title={complete ? "You are all caught up" : "That is the first page"}
      body={
        complete
          ? `You have reached the end of ${where}. Anything posted from now on turns up here.`
          : `There is more below this in ${where}, and the feed does not load it yet. Newest and Top both show one page for now.`
      }
    >
      <ButtonLink href={signedIn ? "/community/new" : "/get-started"}>
        <PenLine className="size-4" aria-hidden />
        {signedIn ? "Write a post" : "Sign in to post"}
      </ButtonLink>

      {/*
        A plain anchor to the top of the document, not a scroll handler. The
        feed scrolls inside <main> rather than the window, so window.scrollTo
        would do nothing, and a hash link is handled by the browser against the
        right scroller with no JavaScript at all.
      */}
      <ButtonLink href="#top" variant="outline" scroll>
        <ArrowUp className="size-4" aria-hidden />
        Back to top
      </ButtonLink>
    </EndOfList>
  );
}
