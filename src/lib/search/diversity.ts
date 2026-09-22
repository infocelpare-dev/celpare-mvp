import { WEIGHTS } from "./ranking";
import type { Candidate, Scored } from "./types";

/*
  Diversification, applied after ranking and before paging.

  THE RULE IS A PUSH DOWN, NEVER A DROP. Nothing is removed for being similar to
  what is above it: a run that is too long is deferred and reappears as soon as
  something else has been placed. With one category in the results that is a no
  op, which is correct rather than broken, and it is the same choice the feed's
  author diversity made in 4.8.

  Why it matters here: "ai image generator" against this catalogue returns eight
  image generators, and a result list where the first five rows are the same
  category with different logos reads as one answer repeated. The brief asks for
  the same thing TikTok says it does, and the mechanism below is a greedy
  reorder with a run limit rather than anything learned.
*/

function keysOf(scored: Scored): { primary: string | null; owner: string | null } {
  const c = scored.candidate;

  if (c.type === "tool") {
    return {
      primary: c.categories[0]?.toLowerCase() ?? null,
      /* No developer_id in the candidate projection, so the domain stands in for
         the same company shipping five near identical tools. It is the value the
         review queue verifies ownership against, which makes it the better key
         anyway. */
      owner: c.slug.split("-")[0] ?? null,
    };
  }
  if (c.type === "model") {
    return { primary: c.provider?.toLowerCase() ?? null, owner: c.provider?.toLowerCase() ?? null };
  }
  if (c.type === "post") {
    return { primary: null, owner: c.authorId };
  }
  return { primary: null, owner: null };
}

/*
  Greedy reorder with a run limit and a hard cap per owner.

  It walks the ranked list, takes the best candidate whose keys do not break a
  rule, and falls back to the best deferred one when everything left breaks one.
  That last clause is what makes this a reorder rather than a filter: the list
  always comes out the same length it went in.
*/
export function diversify<T extends Candidate>(
  ranked: Scored<T>[],
  options?: { maxRun?: number; maxPerOwner?: number },
): Scored<T>[] {
  const maxRun = options?.maxRun ?? WEIGHTS.MAX_PER_CATEGORY_RUN;
  const maxPerOwner = options?.maxPerOwner ?? WEIGHTS.MAX_PER_DEVELOPER;

  const remaining = [...ranked];
  const out: Scored<T>[] = [];
  const ownerCount = new Map<string, number>();

  let runKey: string | null = null;
  let runLength = 0;

  while (remaining.length > 0) {
    let pickedIndex = -1;

    for (let i = 0; i < remaining.length; i += 1) {
      const { primary, owner } = keysOf(remaining[i]);

      const breaksRun = primary !== null && primary === runKey && runLength >= maxRun;
      const breaksOwner =
        owner !== null && (ownerCount.get(owner) ?? 0) >= maxPerOwner;

      if (!breaksRun && !breaksOwner) {
        pickedIndex = i;
        break;
      }
    }

    /* Everything left breaks a rule. Take the best one anyway: a shorter list
       would be a worse answer than a repetitive one. */
    if (pickedIndex === -1) pickedIndex = 0;

    const [picked] = remaining.splice(pickedIndex, 1);
    const { primary, owner } = keysOf(picked);

    if (primary !== null && primary === runKey) {
      runLength += 1;
    } else {
      runKey = primary;
      runLength = 1;
    }
    if (owner !== null) ownerCount.set(owner, (ownerCount.get(owner) ?? 0) + 1);

    out.push(picked);
  }

  return out;
}

/*
  The All tab: one list out of four, interleaved.

  Not a single sort by score, and that is the point. Scores are comparable within
  a type and only roughly across them, so a plain merge would let whichever type
  happens to score highest fill the page. This takes the best few of each, orders
  those by score, and then lets the rest follow, so the top of the page can say
  "here are tools, a model and a person" the way section 18 asks.
*/
export function interleave(
  groups: Scored[][],
  perGroup: number = WEIGHTS.ALL_TAB_PER_TYPE,
): Scored[] {
  const heads: Scored[] = [];
  const tails: Scored[] = [];

  for (const group of groups) {
    heads.push(...group.slice(0, perGroup));
    tails.push(...group.slice(perGroup));
  }

  heads.sort((a, b) => b.score.total - a.score.total);
  tails.sort((a, b) => b.score.total - a.score.total);

  /* Diversified across types as well, so four tools do not open the page when a
     model scored nearly as well. */
  return [
    ...diversify(heads, { maxRun: 3, maxPerOwner: 4 }),
    ...tails,
  ];
}
