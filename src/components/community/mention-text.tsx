import Link from "next/link";
import { cn } from "@/lib/utils";
import { splitMentions } from "@/lib/community/mentions";

/*
  Text with its @mentions drawn as mentions (founder, 2026-11-09). A mention
  links to the person's profile, /u/username.

  `links={false}` where the text already sits inside a link (a feed card's body
  is one link to the post, founder instruction 2026-09-23): a link inside a
  link is invalid HTML and the inner one cannot be pressed reliably, so the
  mention is only emphasised there and the post page has the real link.

  A mention of a name that is no profile still links, and the profile page
  says nobody has that name. The database only notifies real profiles.
*/
export function MentionText({
  text,
  links = true,
  className,
}: {
  text: string;
  links?: boolean;
  /* Extra classes for each mention, e.g. a light colour on a dark sheet. */
  className?: string;
}) {
  return (
    <>
      {splitMentions(text).map((part, i) => {
        if (part.kind === "text") return part.text;
        const look = cn("font-medium text-foreground", className);
        return links ? (
          <Link
            key={i}
            href={`/u/${part.username}`}
            className={cn(look, "underline decoration-current/30 underline-offset-4 hover:decoration-current")}
          >
            {part.text}
          </Link>
        ) : (
          <span key={i} className={look}>
            {part.text}
          </span>
        );
      })}
    </>
  );
}
