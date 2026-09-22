import Link from "next/link";
import { SearchX } from "lucide-react";
import { ChipLink } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import type { ParsedQuery } from "@/lib/search/types";

/*
  Nothing matched.

  NEVER A BLANK PAGE AND NEVER "0 results". The ux guidance rates a search dead
  end Medium severity and names the fix: say what happened, then give somewhere to
  go. So this states the query back, offers the three things that actually help,
  and offers real alternatives.

  NO FABRICATED RESULTS. Nothing here pretends to be a near match. The related
  searches come from popular_searches, which needs three distinct accounts before a
  query counts, and when that returns nothing the list falls back to the real
  category taxonomy. With two accounts in the database the fallback is what shows,
  which is the honest answer rather than an invented "people also searched for".

  ASK CELPARE IS THE BEST OFFER ON THIS PAGE, and that is worth saying plainly: a
  query with no keyword match is exactly the case a model can answer from the
  catalogue it can see. It is a real route, not a consolation.
*/
export function ZeroResults({
  query,
  related,
}: {
  query: ParsedQuery;
  related: string[];
}) {
  return (
    <div className="mt-8 max-w-[52ch]">
      <SearchX className="size-8 text-muted" aria-hidden />

      <h2 className="mt-4 font-display text-[22px] font-semibold leading-tight">
        No results for &ldquo;{query.raw}&rdquo;
      </h2>

      {/*
        A correction is offered only when one was actually found, and it is a
        LINK rather than an automatic rewrite. Searching for something else on
        somebody's behalf and telling them afterwards is how a search engine
        loses an argument it did not need to have.
      */}
      {query.corrected && query.corrected !== query.normalized ? (
        <p className="mt-3 text-[15px] leading-relaxed">
          Did you mean{" "}
          <Link
            href={`/search?q=${encodeURIComponent(query.corrected)}`}
            className="font-medium text-foreground underline underline-offset-4"
          >
            {query.corrected}
          </Link>
          ?
        </p>
      ) : null}

      <ul className="mt-4 space-y-1.5 text-[14px] leading-relaxed text-muted">
        <li>Check the spelling.</li>
        <li>Use fewer words. Two or three usually beats a sentence.</li>
        <li>Try what the thing does rather than its name, or the other way round.</li>
      </ul>

      {related.length > 0 ? (
        <section className="mt-7">
          <h3 className="text-[15px] font-semibold">Try one of these</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {related.map((item) => (
              <ChipLink key={item} href={`/search?q=${encodeURIComponent(item)}`}>
                {item}
              </ChipLink>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-8 border-t border-border pt-6">
        <h3 className="text-[15px] font-semibold">
          Or describe the job instead
        </h3>
        <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
          Ask Celpare reads the whole catalogue and answers in sentences, so it
          can help when the exact words are not in a listing.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <ButtonLink href={`/ask?q=${encodeURIComponent(query.raw)}`}>
            Ask Celpare
          </ButtonLink>
          <ButtonLink href="/explore" variant="outline">
            Browse categories
          </ButtonLink>
        </div>
      </section>
    </div>
  );
}

/*
  Something matched, but nothing matched WELL.

  Retrieval ORs its arms, so almost any English sentence hits a rare word in some
  description somewhere. Dropping those results would be claiming nothing was
  found when something was, and showing them with no comment would present a
  one-word-in-five coincidence as an answer. So the advice comes first and the
  near misses sit under it, which is the same honesty the zero state applies and
  the ux guidance's "never a dead end" without the lie.

  The threshold is measured against the real catalogue. See
  WEIGHTS.WEAK_RESULT_RELEVANCE.
*/
export function WeakMatchNotice({
  query,
  related,
}: {
  query: ParsedQuery;
  related: string[];
}) {
  return (
    <section className="mt-5 rounded-xl border border-border p-4 sm:p-5">
      <h2 className="text-[15px] font-semibold">
        Nothing matched &ldquo;{query.raw}&rdquo; closely
      </h2>
      <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
        What is below came nearest. Fewer words usually helps, or describe what
        the tool does rather than how you would say it out loud.
      </p>

      {query.corrected && query.corrected !== query.normalized ? (
        <p className="mt-3 text-[14px]">
          Did you mean{" "}
          <Link
            href={`/search?q=${encodeURIComponent(query.corrected)}`}
            className="font-medium text-foreground underline underline-offset-4"
          >
            {query.corrected}
          </Link>
          ?
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {related.slice(0, 4).map((item) => (
          <ChipLink key={item} href={`/search?q=${encodeURIComponent(item)}`}>
            {item}
          </ChipLink>
        ))}
        <ChipLink href={`/ask?q=${encodeURIComponent(query.raw)}`}>
          Ask Celpare instead
        </ChipLink>
      </div>
    </section>
  );
}
