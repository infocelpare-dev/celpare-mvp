import Link from "next/link";
import { ArrowRight, Compass } from "lucide-react";
import { AskBox } from "@/components/ask/ask-box";

/*
  The desktop rails.

  THE BRIEF AND THE SPEC DISAGREED HERE, so this is the resolution rather than
  a quiet pick. 10-community.md section 9 says single column and explicitly not
  a three column social layout, on the grounds that there is no third column of
  content and inventing one produces the fake "trending" and "who to follow"
  widgets D13 ruled out. The founder's brief on 2026-09-19 asks for three
  columns. The brief is newer and explicit, so three columns it is, but the
  spec's REASONING still binds what is allowed to go in them: everything in
  these rails is real.

  THERE IS NO LEFT RAIL ANY MORE. It held the topics, and on 2026-09-19 the
  founder ruled that topics appear inside the For you control and nowhere else.
  That was asked once and confirmed a second time after this file argued for
  keeping the rail as a desktop affordance, so the rail is gone rather than
  kept with a caveat. The topics live in feed-tabs.tsx, at every width.

  Right: Ask Celpare, which is built and works and carries the question through
  to /ask rather than throwing it away, plus the directory. Both are real
  destinations with real content behind them.

  What is NOT here: who to follow, trending, suggested people, activity. With
  two accounts on the platform, every one of those is either empty or invented,
  and D30 forbids the second. They arrive when there is something true to put
  in them.

  The remaining rail is xl and up. Below that Ask Celpare is one tap away in
  the header, so nothing is lost and nothing is cramped, which is the responsive
  rule in the brief.

  The topic CHIPS under the feed tabs render at every width, including xl where
  the rail is also showing. That is two routes to the same place on purpose,
  on the founder's instruction that topics belong inside For you. They carry
  DIFFERENT landmark labels for that reason: two navs both called "Topics"
  would read as a duplicate to a screen reader running through the landmarks.
*/

export function DiscoverRail() {
  return (
    <aside
      aria-label="Discover"
      className="hidden w-[300px] shrink-0 xl:block"
    >
      <div className="sticky top-4 space-y-4">
        <section className="rounded-2xl border border-border p-4">
          <h2 className="font-display text-[15px] font-semibold">
            Not sure what you need?
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            Describe the job and Celpare recommends the tools that fit, with the
            reasons.
          </p>
          <div className="mt-3">
            <AskBox />
          </div>
        </section>

        <section className="rounded-2xl border border-border p-4">
          <h2 className="font-display text-[15px] font-semibold">
            Browse the directory
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            Every tool and model in Celpare, by category.
          </p>
          <Link
            href="/explore"
            className="mt-3 inline-flex items-center gap-1.5 text-[14px] text-foreground underline underline-offset-4 transition-colors duration-200 ease-out hover:text-muted"
          >
            <Compass className="size-4" aria-hidden />
            Explore
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </section>
      </div>
    </aside>
  );
}
