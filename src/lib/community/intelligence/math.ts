/*
  The small numeric tools every stage shares. Kept here so there is one
  definition of "saturate" and one of "decay", not six that drift apart.
*/

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/*
  A count mapped onto 0..1 with diminishing returns. `scale` is the count that
  lands at about 0.63. This is what stops a thousand likes being a thousand times
  better than one: likes*10 is exactly the thing the brief rules out.
*/
export function saturate(count: number, scale: number): number {
  if (!(count > 0) || !(scale > 0)) return 0;
  return 1 - Math.exp(-count / scale);
}

/* Exponential half life decay. `age` and `halfLife` in the same unit. */
export function halfLifeDecay(age: number, halfLife: number): number {
  if (!(halfLife > 0)) return 1;
  return Math.pow(0.5, Math.max(0, age) / halfLife);
}

export function hoursBetween(from: number, to: number): number {
  return Math.max(0, to - from) / 3_600_000;
}

/*
  A rate pulled toward a prior until there is enough evidence to trust it.
  3 likes from 4 impressions is not a 75% like rate; with a prior of 5% over 20
  pseudo impressions it is (3 + 1) / (4 + 20) = 17%. This is the confidence
  adjustment the brief asks for, and it is why a new post is neither buried nor
  crowned by its first handful of views.
*/
export function shrunkRate(
  successes: number,
  trials: number,
  priorRate: number,
  priorWeight: number,
): number {
  const s = Math.max(0, successes);
  const t = Math.max(s, trials);
  return (s + priorRate * priorWeight) / (t + priorWeight);
}

/*
  Wilson score lower bound: the rate we can be ~95% sure a post at least earns.
  2 saves from 3 viewers has a raw rate of 67% and a lower bound of about 21%;
  40 from 60 has the same raw rate and a lower bound near 54%. This is the
  confidence aware estimate the brief asks for: small samples cannot win on a
  lucky ratio.
*/
export function wilsonLower(successes: number, trials: number, z = 1.96): number {
  if (!(trials > 0)) return 0;
  const s = Math.min(Math.max(0, successes), trials);
  const p = s / trials;
  const z2 = z * z;
  const centre = p + z2 / (2 * trials);
  const margin = z * Math.sqrt((p * (1 - p)) / trials + z2 / (4 * trials * trials));
  return Math.max(0, (centre - margin) / (1 + z2 / trials));
}

/* How far to trust a measured rate: 0 with no trials, toward 1 with many. */
export function confidence(trials: number, halfTrust: number): number {
  if (!(trials > 0)) return 0;
  return trials / (trials + halfTrust);
}

export function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx];
}

/*
  FNV-1a, 32 bit. Deterministic, so the same person gets the same experiment
  variant, the same exploration picks and the same tie breaks on every request.
  Not a security primitive and never used as one.
*/
export function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/* A stable number in [0, 1) for a string. */
export function unitHash(input: string): number {
  return hash32(input) / 4_294_967_296;
}

/* Max of a map's values, 0 for an empty map. */
export function maxValue(map: Map<string, number>): number {
  let m = 0;
  for (const v of map.values()) if (v > m) m = v;
  return m;
}
