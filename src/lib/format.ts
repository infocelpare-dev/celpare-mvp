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

/*
  Bytes, for the storage panel.

  Binary units, because that is what a storage bucket's own size limit is
  expressed in: the avatars bucket caps at 2097152, which is 2 MiB and not
  2.1 MB. Reporting it as the latter beside a limit written as the former is how
  somebody ends up chasing a discrepancy that is not there.
*/
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";

  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let value = n;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  const shown = unit === 0 ? String(Math.round(value)) : value.toFixed(value < 10 ? 1 : 0);
  return `${shown.replace(/\.0$/, "")} ${units[unit]}`;
}
