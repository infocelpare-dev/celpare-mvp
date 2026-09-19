import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { personName } from "@/lib/format";
import type { FollowPerson } from "@/lib/profile/queries";

/*
  A list of people: the followers of somebody, or the people they follow.

  One component for both, because they are the same list of the same shape and
  differ only in which query filled them. What they must NOT share is an empty
  state, so the caller supplies that sentence: "nobody follows them yet" and
  "they follow nobody yet" are different facts, and the 4.11 empty states made
  the same distinction for the feed.

  Each row is one link covering the whole row rather than a name link beside a
  dead avatar, so the target is the row and not a word inside it.

  No Follow button on a row. It would need each person's follow state fetched
  for the viewer, and more to the point a list is for going somewhere: mixing a
  navigation target with a write control inside the same 44px row is how a tap
  meant for a profile follows somebody by accident.
*/
export function PeopleList({
  people,
  empty,
}: {
  people: FollowPerson[];
  /* The sentence for an empty list. Written by the caller, because an empty
     followers list and an empty following list do not mean the same thing. */
  empty: string;
}) {
  if (people.length === 0) {
    return (
      <p className="border-t border-border py-10 text-center text-[14px] text-muted">
        {empty}
      </p>
    );
  }

  return (
    <ul className="border-t border-border">
      {people.map((person) => (
        <li key={person.id}>
          <Link
            href={`/u/${person.username}`}
            className="flex items-center gap-3 border-b border-border px-1 py-3.5 transition-colors duration-200 ease-out hover:bg-surface"
          >
            <Avatar
              size="md"
              fullName={person.full_name}
              username={person.username}
              avatarUrl={person.avatar_url}
              className="shrink-0"
            />

            <span className="min-w-0 flex-1">
              {/* The name, then the handle under it. Same order as the profile
                  header, so the two read as the same identity (D94). */}
              <span className="block truncate text-[15px] font-medium">
                {personName(person)}
              </span>
              <span className="block truncate text-[13px] text-muted">
                @{person.username}
              </span>
              {person.bio ? (
                <span className="mt-0.5 line-clamp-1 block text-[13px] text-muted">
                  {person.bio}
                </span>
              ) : null}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
