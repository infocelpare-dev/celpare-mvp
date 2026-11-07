import type { WebResult } from "../types";

/*
  Pooling and ranking web results for deep research (phase DR). Pure.

  Pool: deduplicate by URL, interleaved rather than concatenated, so every
  query keeps a place when the cap bites (unchanged from research.ts, 4F).

  Rank for reading: the pages worth opening in full. A candidate's own site
  first, because a pricing or docs page is the primary source; then pages whose
  path says pricing, docs or setup; then the rest in pooled order.
*/

export function urlKey(url: string): string {
  return url.toLowerCase().replace(/[#?].*$/, "").replace(/\/$/, "");
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function poolResults(batches: WebResult[][], max: number): WebResult[] {
  const seen = new Set<string>();
  const pooled: WebResult[] = [];
  const depth = Math.max(0, ...batches.map((b) => b.length));
  for (let i = 0; i < depth && pooled.length < max; i += 1) {
    for (const batch of batches) {
      if (pooled.length >= max) break;
      const r = batch[i];
      if (!r) continue;
      const key = urlKey(r.url);
      if (seen.has(key)) continue;
      seen.add(key);
      pooled.push(r);
    }
  }
  return pooled;
}

const USEFUL_PATH = /\/(pricing|plans|docs?|documentation|guide|guides|getting-started|quickstart|quick-start|setup|install|tutorial|learn)\b/i;

function onDomain(host: string, domains: string[]): boolean {
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}

/* Indexes into `pooled`, best first, at most `n`. Stable within each band. */
export function rankForReading(pooled: WebResult[], officialDomains: string[], n: number): number[] {
  const domains = officialDomains.map((d) => d.toLowerCase().replace(/^www\./, "")).filter(Boolean);
  const scored = pooled.map((r, i) => {
    const host = hostOf(r.url) ?? "";
    let band = 2;
    if (domains.length && onDomain(host, domains)) band = 0;
    else if (USEFUL_PATH.test(r.url)) band = 1;
    return { i, band };
  });
  return scored.sort((a, b) => a.band - b.band || a.i - b.i).slice(0, n).map((x) => x.i);
}
