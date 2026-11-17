/*
  Picked by Celpare (D270).

  An editor's pick, labelled as one. The newest pick is pinned to the top of
  For you for PIN_DAYS; after that it keeps its label and ranks like any post.
  A pick never changes a count (D13, D30): it is Celpare saying "worth a look",
  not a claim that people engaged.

  Pure, so the rule is tested without a database. The page reads the rows and
  the viewer's own feedback and asks this which post, if any, goes first.
*/

export const PICKS = {
  /* How long the newest pick is pinned to the top of For you. */
  PIN_DAYS: 7,
} as const;

export type PickRow = { postId: string; pickedAt: string };

export type PinContext = {
  now: number;
  viewerId: string | null;
  /* Posts this viewer said they are not interested in. */
  notInterested: ReadonlySet<string>;
  /* Authors this viewer muted. */
  mutedAuthors: ReadonlySet<string>;
};

export type PinCandidate = { postId: string; authorId: string; pickedAt: string };

/*
  The post to pin, or null. Newest pick first; a pick older than PIN_DAYS is
  not pinned. Skipped for the viewer when they wrote it (their own post on top
  of their feed is noise), said not interested in it, or muted its author:
  a pin never overrides somebody's own choice.
*/
export function choosePinnedPick(candidates: PinCandidate[], ctx: PinContext): string | null {
  const cutoff = ctx.now - PICKS.PIN_DAYS * 24 * 60 * 60_000;
  const ordered = [...candidates].sort(
    (a, b) => new Date(b.pickedAt).getTime() - new Date(a.pickedAt).getTime(),
  );
  for (const c of ordered) {
    const at = new Date(c.pickedAt).getTime();
    if (!Number.isFinite(at) || at < cutoff) continue;
    if (ctx.viewerId && c.authorId === ctx.viewerId) continue;
    if (ctx.notInterested.has(c.postId)) continue;
    if (ctx.mutedAuthors.has(c.authorId)) continue;
    return c.postId;
  }
  return null;
}

/* Put the pinned post first and drop its other copy, so it is never shown twice. */
export function pinFirst<T extends { id: string }>(posts: T[], pinned: T | null): T[] {
  if (!pinned) return posts;
  return [pinned, ...posts.filter((p) => p.id !== pinned.id)];
}
