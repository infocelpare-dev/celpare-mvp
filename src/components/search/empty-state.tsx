import Link from "next/link";
import { ChipLink } from "@/components/ui/card";
import { ToolResult, ModelResult, PersonResult } from "./results";
import type { Recommendations } from "@/lib/search/recommendations";
import type { Scored, PersonCandidate } from "@/lib/search/types";

/*
  What search looks like before anybody has typed anything.

  THESE ARE RECOMMENDATIONS AND THE PAGE SAYS SO. Section 2 is explicit that they
  must not be mistaken for results, so each block is under a heading that names it,
  and every one of them disappears the moment a query exists.

  A BLOCK WITH NOTHING IN IT IS NOT RENDERED. With no models in the catalogue
  there is no "Models to try" heading standing over an empty space, and with one
  other account there may be no people block either. An empty heading is the
  invented content D30 rules out, one step removed: it promises something the
  product does not have yet.

  The categories row is real taxonomy, the eight seeded categories, which is the
  one thing on this page that is guaranteed to be populated. It is also the most
  useful thing to offer somebody who has not decided what to type.
*/
export function SearchEmptyState({
  recommendations,
  categories,
  signedIn,
  following,
  viewerId,
}: {
  recommendations: Recommendations;
  categories: { name: string; slug: string }[];
  signedIn: boolean;
  following: Set<string>;
  viewerId?: string | null;
}) {
  const { tools, models, people } = recommendations;

  return (
    <div className="mt-2">
      {categories.length > 0 ? (
        <section className="border-b border-border pb-6">
          <h2 className="text-[15px] font-semibold">Browse by category</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {categories.map((c) => (
              <ChipLink key={c.slug} href={`/search?q=${encodeURIComponent(c.name)}`}>
                {c.name}
              </ChipLink>
            ))}
          </div>
        </section>
      ) : null}

      {tools.length > 0 ? (
        <Block
          title="Tools worth a look"
          /* Named, because it is the honest description of how they were chosen:
             quality and real engagement, not an editorial pick and not a ranking
             of anything anybody searched for. */
          note="Chosen by rating, how complete the listing is and recent interest."
        >
          <ol className="border-t border-border">
            {tools.map((item, i) => (
              <ToolResult key={item.candidate.id} item={item} position={i} />
            ))}
          </ol>
        </Block>
      ) : null}

      {models.length > 0 ? (
        <Block title="Models to compare">
          <ol className="border-t border-border">
            {models.map((item, i) => (
              <ModelResult key={item.candidate.id} item={item} position={i} />
            ))}
          </ol>
        </Block>
      ) : null}

      {people.length > 0 ? (
        <Block title="People to follow">
          <ol className="border-t border-border">
            {people.map((person, i) => (
              <PersonResult
                key={person.id}
                item={asScored(person)}
                position={i}
                signedIn={signedIn}
                following={following.has(person.id)}
                viewerId={viewerId}
              />
            ))}
          </ol>
        </Block>
      ) : null}

      <p className="mt-8 text-[14px] leading-relaxed text-muted">
        Looking for something specific? Type it above. Or{" "}
        <Link href="/ask" className="text-foreground underline underline-offset-4">
          ask Celpare
        </Link>{" "}
        what fits the job.
      </p>
    </div>
  );
}

function Block({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-7">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {note ? <p className="mt-1 text-[13px] text-muted">{note}</p> : null}
      <div className="mt-2">{children}</div>
    </section>
  );
}

/*
  Suggested people arrive from suggested_people rather than from the ranker, so
  they have no score and no reason. This wraps one in the shape the card expects
  with an explicitly empty score rather than a made up one, which is what keeps
  the card from claiming a match that never happened.
*/
function asScored(person: PersonCandidate): Scored<PersonCandidate> {
  return {
    candidate: person,
    score: {
      relevance: 0,
      semantic: 0,
      quality: 0,
      popularity: 0,
      engagement: 0,
      freshness: 0,
      personalization: 0,
      behaviour: 0,
      penalty: 0,
      total: 0,
    },
    reason: null,
  };
}
