import { DIVERSITY, LIMITS, type CommentMode } from "./config";
import { duplicateIndex } from "./penalties";
import { byScore, scoreComment } from "./scoring";
import { jaccard, shingles } from "./text";
import type { CommentRow, RankContext, Scored } from "./types";

/*
  Ordering for the three modes (D214).

  TOP: personalised score, the viewer's own fresh comment first, then a
  diversity pass over the visible top section.
  FOLLOWING: the same score over comments by accounts the viewer follows (the
  pool already restricts authors; this re-checks, so a stale row cannot slip in).
  NEWEST: strictly reverse chronological, no score involved in the order.

  Comments the viewer hid, or hid as Not interested, are never returned.
*/

export function rankRoots(rows: CommentRow[], ctx: RankContext, mode: CommentMode): Scored[] {
  const visible = rows.filter((r) => !r.viewerHid);
  const eligible =
    mode === "following" ? visible.filter((r) => ctx.viewerId && r.viewerFollows && r.authorId !== ctx.viewerId) : visible;
  const dupes = duplicateIndex(eligible);
  const scored = eligible.map((r) => scoreComment(r, ctx, dupes));

  if (mode === "newest") {
    return scored
      .sort((a, b) => b.row.createdAt.localeCompare(a.row.createdAt) || b.row.id.localeCompare(a.row.id))
      .map((s) => ({ ...s, reason: "newest" as const, pinned: false }));
  }

  scored.sort(byScore);
  if (mode === "top") {
    const pinned = scored.filter((s) => s.pinned).sort((a, b) => b.row.createdAt.localeCompare(a.row.createdAt));
    const rest = scored.filter((s) => !s.pinned);
    return diversify([...pinned, ...rest]);
  }
  return diversify(scored.map((s) => ({ ...s, pinned: false })));
}

/*
  The visible top section may not be dominated by one author or by copies of
  one comment. Inside the first DIVERSITY.window places, an author's third
  comment, or a near duplicate of a comment already placed, waits until the
  window is full and then follows in its own score order. Nothing is dropped.
*/
export function diversify(list: Scored[]): Scored[] {
  const placed: Scored[] = [];
  const placedShingles: Set<string>[] = [];
  const waiting: Scored[] = [];
  const perAuthor = new Map<string, number>();
  let i = 0;

  for (; i < list.length && placed.length < DIVERSITY.window; i += 1) {
    const s = list[i];
    const n = perAuthor.get(s.row.authorId) ?? 0;
    const sh = shingles(s.row.body);
    const copy = sh.size >= 3 && placedShingles.some((p) => p.size >= 3 && jaccard(p, sh) >= DIVERSITY.nearDuplicate);
    if (!s.pinned && (n >= DIVERSITY.perAuthor || copy || s.penalties.severe)) {
      waiting.push(s);
      continue;
    }
    placed.push(s);
    placedShingles.push(sh);
    perAuthor.set(s.row.authorId, n + 1);
  }

  /* Everything after the window keeps score order, the waiting ones included. */
  const tail = [...waiting, ...list.slice(i)].sort(byScore);
  return [...placed, ...tail];
}

/*
  Replies, for every root on the page at once. A reply is scored against the
  post AND the comment it answers. The post author's own replies come first
  under their parent (unless penalised), because on a post the author's answer
  is usually the one people opened the thread for. Newest keeps replies in
  reading order, oldest first, so a conversation still reads top to bottom.
*/
export function rankReplies(rows: CommentRow[], ctx: RankContext, mode: CommentMode, parentBody: Map<string, string>): Scored[] {
  const visible = rows.filter((r) => !r.viewerHid);
  const dupes = duplicateIndex(visible);
  const scored = visible.map((r) =>
    scoreComment(r, ctx, dupes, `${ctx.postText}\n${(r.parentId && parentBody.get(r.parentId)) ?? ""}`),
  );

  if (mode === "newest") {
    return scored
      .sort((a, b) => a.row.createdAt.localeCompare(b.row.createdAt) || a.row.id.localeCompare(b.row.id))
      .map((s) => ({ ...s, reason: "newest" as const, pinned: false }));
  }

  const authorFirst = (s: Scored) => (s.row.isPostAuthor && !s.penalties.severe && s.penalties.total < 0.5 ? 1 : 0);
  return scored
    .map((s) => ({ ...s, pinned: false }))
    .sort((a, b) => authorFirst(b) - authorFirst(a) || byScore(a, b));
}

/* ------------------------------------------------------------ pagination */

export type NewestCursor = { createdAt: string; id: string };

export type Page = {
  roots: Scored[];
  hasMore: boolean;
  /* Newest only: where the next page starts. */
  next: NewestCursor | null;
  /* Position of the first root on this page, for impression events. */
  offset: number;
};

/*
  Top and Following page by exclusion: the client sends back the root ids it
  already shows, the pool leaves them out, and the rest is ranked again. No
  comment can appear twice, and none can be skipped, because everything not yet
  shown is still a candidate. Newest pages by keyset on (created_at, id).
*/
export function takePage(ranked: Scored[], mode: CommentMode, seenCount: number, pageSize: number = LIMITS.pageSize): Page {
  const roots = ranked.slice(0, pageSize);
  const hasMore = ranked.length > pageSize;
  const last = roots[roots.length - 1];
  return {
    roots,
    hasMore,
    next: mode === "newest" && hasMore && last ? { createdAt: last.row.createdAt, id: last.row.id } : null,
    offset: seenCount,
  };
}
