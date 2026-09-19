/*
  Feed ranking v1. D29.

  The whole point of this file is that the weights are tunable without anybody
  opening a query. Architecture section 9 asks for a named candidate generator,
  feature extractor, scoring function, filtering and diversity rules; at v1
  scale those are one windowed select and the functions below.

  WHY THE SCORE IS COMPUTED HERE AND NOT IN SQL. `posts.score` is a real column
  and it is dead: no trigger maintains it, verified against pg_trigger, so it
  reads 0 on every row. Two ways to make it true were available. A trigger that
  rewrites the score on every like would still go stale, because the score
  changes with the CLOCK and not only with engagement: a post nobody touches
  gets less relevant every hour, and no trigger fires on the passage of time. A
  generated column cannot call now() either, since it must be immutable. So the
  decay has to be evaluated at read time regardless, and evaluating it here
  keeps D29's actual requirement: the numbers below are the only thing anybody
  edits to retune the feed.

  This runs on the server, inside a server component. "Not in the client" in
  10-community.md section 8 means not in the browser, and it is not.
*/

export const RANKING = {
  /* A comment costs more to produce than a like, and a save is the only signal
     that maps to what Celpare is for: somebody deciding a thing is worth
     coming back to. */
  W_LIKE: 1,
  W_COMMENT: 2,
  W_SAVE: 3,
  /* Keeps a post with no engagement above zero, so age alone still orders a
     quiet feed instead of every row tying at 0. */
  W_BASE: 1,
  /* The exponent on age. Higher means the feed forgets faster. This is the
     one number that stops Top becoming the permanent leaderboard Notion warns
     about, because without it the oldest popular post wins forever. */
  GRAVITY: 1.5,
  /* Hours added to the age before the exponent, so a brand new post with a
     single like cannot spike to the top. */
  AGE_OFFSET_HOURS: 2,
  /* No more than this many consecutive posts from one author. */
  MAX_CONSECUTIVE_PER_AUTHOR: 2,
  /* Below this many visible posts, Top is meaningless and New is the default.
     A runtime check on the real count, not a hardcoded switch somebody has to
     remember to flip. */
  TOP_NEEDS_POSTS: 20,
  /* How many rows the candidate generator pulls before scoring. Scoring is
     O(n) arithmetic over this window, not over the table. */
  CANDIDATE_WINDOW: 120,
  /* How many survive to the page. */
  PAGE_SIZE: 20,
} as const;

/*
  The auto hide threshold is deliberately NOT here. It lives in
  community_settings, because the trigger that enforces it is in the database
  and a trigger cannot read a TypeScript file. 10-community.md section 10 says
  so, and a copy here would be a second number that drifts from the true one.
*/

export type Sort = "top" | "new";

export function isSort(value: string | undefined): value is Sort {
  return value === "top" || value === "new";
}

export type Scorable = {
  created_at: string;
  like_count: number;
  comment_count: number;
  save_count: number;
};

/*
  score = (likes*W_LIKE + comments*W_COMMENT + saves*W_SAVE + W_BASE)
          / (hours_since + AGE_OFFSET) ^ GRAVITY
*/
export function scoreOf(post: Scorable, now: number = Date.now()): number {
  const ageMs = now - new Date(post.created_at).getTime();
  /* A clock skew or a row written a second into the future must not produce a
     negative age, which would invert the exponent and rank it absurdly high. */
  const ageHours = Math.max(0, ageMs) / 3_600_000;

  const engagement =
    post.like_count * RANKING.W_LIKE +
    post.comment_count * RANKING.W_COMMENT +
    post.save_count * RANKING.W_SAVE +
    RANKING.W_BASE;

  return engagement / Math.pow(ageHours + RANKING.AGE_OFFSET_HOURS, RANKING.GRAVITY);
}

/*
  The diversity rule, applied after scoring.

  Not a filter: nothing is dropped. A third consecutive post from one author is
  pushed down to sit after the next post by somebody else, so a person who
  writes five things in a row still has all five in the feed and does not own
  the first screen. At one active author, which is the state today, this is a
  no-op by construction, and that is the correct behaviour rather than a bug:
  there is nobody to interleave with.
*/
export function interleaveAuthors<T extends { author_id: string }>(
  ranked: T[],
  max: number = RANKING.MAX_CONSECUTIVE_PER_AUTHOR,
): T[] {
  const out: T[] = [];
  const held: T[] = [];
  let lastAuthor: string | null = null;
  let run = 0;

  const queue = [...ranked];

  while (queue.length > 0 || held.length > 0) {
    /* Prefer a held post whose author is no longer the one repeating. */
    const heldIndex = held.findIndex((p) => p.author_id !== lastAuthor);
    if (run >= max && heldIndex !== -1) {
      const [post] = held.splice(heldIndex, 1);
      out.push(post);
      lastAuthor = post.author_id;
      run = 1;
      continue;
    }

    const next = queue.shift();
    if (!next) {
      /* Nothing left but held posts from the repeating author. The run rule
         has done what it can, so they go out in score order rather than being
         lost. */
      out.push(...held);
      break;
    }

    if (next.author_id === lastAuthor && run >= max) {
      held.push(next);
      continue;
    }

    out.push(next);
    run = next.author_id === lastAuthor ? run + 1 : 1;
    lastAuthor = next.author_id;
  }

  return out;
}

/* Top only means something once there is enough to rank. */
export function defaultSort(visiblePostCount: number): Sort {
  return visiblePostCount >= RANKING.TOP_NEEDS_POSTS ? "top" : "new";
}
