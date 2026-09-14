/*
  Pure formatters, deliberately in their own module rather than beside a
  component. Anything exported from a "use client" file can only be called on
  the client, and these are needed on both sides: the profile header renders on
  the server, the tab strip on the client.
*/

/* 1.2K rather than 1200, per 10-community.md section 9. */
export function formatCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    const k = n / 1000;
    return `${k < 10 ? k.toFixed(1).replace(/\.0$/, "") : Math.round(k)}K`;
  }
  const m = n / 1_000_000;
  return `${m < 10 ? m.toFixed(1).replace(/\.0$/, "") : Math.round(m)}M`;
}
