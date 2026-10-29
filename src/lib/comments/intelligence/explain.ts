import type { Scored } from "./types";

/*
  The admin debug view (?debug=1 on a post, admins only, D217). Built on the
  server and only when the gate allows it; nobody else ever receives scores,
  features, penalties or the viewer's history. Rounded so it reads.
*/

export type DebugRow = {
  id: string;
  author: string;
  depth: "root" | "reply";
  score: number;
  positive: number;
  penalty: number;
  severe: string | null;
  reason: string;
  contributions: { name: string; value: number }[];
  penalties: { name: string; value: number }[];
};

const r3 = (x: number) => Math.round(x * 1000) / 1000;

export function debugRows(scored: Scored[]): DebugRow[] {
  return scored.map((s) => ({
    id: s.row.id,
    author: s.row.author.username ?? s.row.authorId.slice(0, 8),
    depth: s.row.parentId ? "reply" : "root",
    score: r3(s.score),
    positive: r3(s.positive),
    penalty: r3(s.penalties.total),
    severe: s.penalties.severe,
    reason: s.reason,
    contributions: Object.entries(s.contributions)
      .map(([name, value]) => ({ name, value: r3(value) }))
      .filter((c) => c.value > 0)
      .sort((a, b) => b.value - a.value),
    penalties: Object.entries(s.penalties.applied).map(([name, value]) => ({ name, value: r3(value ?? 0) })),
  }));
}
