import {
  emptyBuckets,
  NO_SIGNALS,
  type PostSignals,
  type SignalStat,
  type SignalType,
} from "./types";

/*
  Turning feed_post_signals() rows into PostSignals, and reading them back.

  The row shape is (post_id, signal, bucket, n, uniq, value), with bucket 0..5
  by age and 9 for all time. Parsing is here rather than in the server layer so
  it is tested with the rest.
*/

export type SignalRow = {
  post_id: string;
  signal: string;
  bucket: number;
  n: number;
  uniq: number;
  value: number | null;
};

const KNOWN = new Set<SignalType>([
  "like",
  "comment",
  "author_reply",
  "repost",
  "save",
  "impression",
  "open",
  "dwell",
  "video_start",
  "complete",
  "share",
  "follow_after",
  "profile_visit",
  "not_interested",
  "skip",
  "swipe_watched",
  "watch",
  "rewatch",
  "report",
]);

function stat(): SignalStat {
  return { n: emptyBuckets(), uniq: emptyBuckets(), total: 0, totalUniq: 0, avg: null };
}

export function parseSignalRows(rows: SignalRow[]): Map<string, PostSignals> {
  const out = new Map<string, PostSignals>();

  for (const row of rows) {
    let s = out.get(row.post_id);
    if (!s) {
      s = { byType: {}, qualifiedReports: 0, authorInactive: false };
      out.set(row.post_id, s);
    }

    if (row.signal === "qualified_reports") {
      s.qualifiedReports = Number(row.n) || 0;
      continue;
    }
    if (row.signal === "author_inactive") {
      s.authorInactive = true;
      continue;
    }
    if (!KNOWN.has(row.signal as SignalType)) continue;

    const type = row.signal as SignalType;
    const st = s.byType[type] ?? (s.byType[type] = stat());
    const n = Number(row.n) || 0;
    const uniq = Number(row.uniq) || 0;
    const bucket = Number(row.bucket);

    if (bucket === 9) {
      st.total = n;
      st.totalUniq = uniq;
      st.avg = row.value === null || row.value === undefined ? null : Number(row.value);
    } else if (bucket >= 0 && bucket <= 5) {
      st.n[bucket] = n;
      st.uniq[bucket] = uniq;
    }
  }

  return out;
}

export function signalsFor(map: Map<string, PostSignals>, postId: string): PostSignals {
  return map.get(postId) ?? NO_SIGNALS;
}

/* Events of a type within the newest `buckets` buckets (1 = last hour, 3 = last
   day, 6 = everything). */
export function countWithin(s: PostSignals, type: SignalType, buckets: number): number {
  const st = s.byType[type];
  if (!st) return 0;
  let sum = 0;
  for (let i = 0; i < Math.min(buckets, 6); i++) sum += st.n[i];
  return sum;
}

/* Distinct people within a window. Summed across buckets, so a person active in
   two buckets counts twice: an upper bound, used only for windows. */
export function uniqWithin(s: PostSignals, type: SignalType, buckets: number): number {
  const st = s.byType[type];
  if (!st) return 0;
  let sum = 0;
  for (let i = 0; i < Math.min(buckets, 6); i++) sum += st.uniq[i];
  return sum;
}

export function total(s: PostSignals, type: SignalType): number {
  return s.byType[type]?.total ?? 0;
}

export function totalUniq(s: PostSignals, type: SignalType): number {
  return s.byType[type]?.totalUniq ?? 0;
}

export function average(s: PostSignals, type: SignalType): number | null {
  return s.byType[type]?.avg ?? null;
}
