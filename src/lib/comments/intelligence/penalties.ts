import { DIVERSITY, PENALTY, SEVERE } from "./config";
import { jaccard, linkCount, shingles } from "./text";
import type { CommentRow, PenaltyName, Penalties, SevereReason } from "./types";

/*
  Penalties, separate from the positive score (D215). Two kinds:

  SEVERE puts a comment after every comment without one, whatever else is true:
  not visible (only its author or a moderator can see it at all), a report a
  moderator qualified, or an author whose account is suspended or disabled.

  ORDINARY penalties remove a share of the positive score, combined as
  1 - product(1 - p) so two penalties never remove more than everything, and
  capped. They apply the same way to a friend as to a stranger.
*/

export type DuplicateIndex = Map<string, { sameAuthor: boolean; copied: boolean }>;

/*
  Near duplicates within the candidate set. A comment repeats its own author
  (spam), or copies an EARLIER comment by somebody else (copypasta). The earlier
  one is the original and is never penalised for being copied.
*/
export function duplicateIndex(rows: CommentRow[]): DuplicateIndex {
  const ordered = [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const sh = ordered.map((r) => shingles(r.body));
  const out: DuplicateIndex = new Map();
  for (let i = 0; i < ordered.length; i += 1) {
    let sameAuthor = false;
    let copied = false;
    if (sh[i].size >= 3) {
      for (let j = 0; j < ordered.length; j += 1) {
        if (i === j || sh[j].size < 3) continue;
        if (jaccard(sh[i], sh[j]) < DIVERSITY.nearDuplicate) continue;
        if (ordered[j].authorId === ordered[i].authorId) sameAuthor = true;
        else if (j < i) copied = true;
      }
    }
    out.set(ordered[i].id, { sameAuthor, copied });
  }
  return out;
}

export function severeReason(row: CommentRow): SevereReason | null {
  if (row.status !== "visible") return "not_visible";
  if (row.qualifiedReportCount >= SEVERE.qualifiedReports) return "qualified_report";
  if (row.author.status && row.author.status !== "active") return "author_suspended";
  return null;
}

export function computePenalties(row: CommentRow, dupes: DuplicateIndex): Penalties {
  const applied: Partial<Record<PenaltyName, number>> = {};
  const body = row.body;

  if (row.reportCount >= SEVERE.reportsForPenalty) applied.many_reports = PENALTY.manyReports;

  const links = linkCount(body);
  if (links >= 2) applied.links = PENALTY.links;
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  if (links >= 1 && words <= 3) applied.link_only = PENALTY.linkOnly;
  if (/(.)\1{7,}/u.test(body)) applied.repeated_chars = PENALTY.repeatedChars;
  const letters = body.replace(/[^\p{L}]/gu, "");
  if (letters.length >= 20 && letters === letters.toUpperCase() && letters !== letters.toLowerCase()) {
    applied.shouting = PENALTY.shouting;
  }

  const d = dupes.get(row.id);
  if (d?.sameAuthor) applied.same_author_duplicate = PENALTY.sameAuthorDuplicate;
  if (d?.copied) applied.copied_text = PENALTY.copiedText;

  /* Suspicious engagement. Most of the support from week old accounts, or most
     of it landing in the first quarter hour, is how bought or coordinated likes
     look. It costs the comment its boost, it does not hide it. */
  const all = row.trustedLikes + row.newAccountLikes;
  if (row.newAccountLikes >= 3 && row.newAccountLikes / all > 0.5) applied.new_account_likes = PENALTY.newAccountLikes;
  if (row.earlyLikes >= 5 && row.earlyLikes / Math.max(1, row.likeCount) > 0.8 && row.trustedLikes < row.earlyLikes) {
    applied.early_burst = PENALTY.earlyBurst;
  }

  if (row.viewerNotInterestedAuthor > 0) applied.not_interested_author = PENALTY.notInterestedAuthor;

  let keep = 1;
  for (const p of Object.values(applied)) keep *= 1 - (p ?? 0);
  return { applied, total: Math.min(PENALTY.cap, 1 - keep), severe: severeReason(row) };
}
