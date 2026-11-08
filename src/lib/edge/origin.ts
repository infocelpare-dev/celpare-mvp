import { createHash, timingSafeEqual } from "node:crypto";

/*
  Origin authentication (D254). Production runs on Vercel with Cloudflare in
  front (D253). Vercel can also be reached without Cloudflare: through the
  project's *.vercel.app address, or through Vercel's own IP with
  Host: celpare.com. A request that skipped Cloudflare also skipped its rate
  limit, and could forge cf-connecting-ip to pick a new address, and a new
  allowance, on every request (D120, D121), or to write a false IP into the
  admin audit log.

  So Cloudflare proves itself: a Request Header Transform Rule adds
  x-celpare-edge with a secret only Cloudflare and Vercel know (EDGE_SECRET).
  src/proxy.ts asks edgeVerdict() about every request it sees:

    ok      the header matches. cf-connecting-ip can be trusted.
    off     no secret configured and not Vercel production: local development,
            or the Cloudflare Worker (where only Cloudflare could reach the app).
            Behaves as before.
    reject  Vercel production without a matching header, or with no secret set
            at all. Fails closed: a missing secret is a configuration error the
            smoke test catches before celpare.com is switched over.

  The proxy then strips whatever a client sent in TRUSTED_HEADER and sets it
  itself, so request code can read one header instead of repeating the check.
*/

export const EDGE_HEADER = "x-celpare-edge";
export const TRUSTED_HEADER = "x-celpare-edge-trusted";

export type EdgeVerdict = "ok" | "off" | "reject";

type Env = Partial<Record<"EDGE_SECRET" | "VERCEL_ENV", string>> & Record<string, string | undefined>;

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/* Constant time, and no length leak: both sides are hashed to 32 bytes first. */
export function sameSecret(given: string | null | undefined, expected: string): boolean {
  if (typeof given !== "string" || given.length === 0) return false;
  return timingSafeEqual(digest(given), digest(expected));
}

export function edgeVerdict(headerValue: string | null | undefined, env: Env = process.env): EdgeVerdict {
  const secret = env.EDGE_SECRET?.trim();
  if (secret) return sameSecret(headerValue, secret) ? "ok" : "reject";
  return env.VERCEL_ENV === "production" ? "reject" : "off";
}

/*
  The client address, as far as it can be trusted.

  cf-connecting-ip first, but only when the proxy marked the request as having
  come through Cloudflare; otherwise anyone could set it. Then x-real-ip, which
  Vercel and most proxies overwrite. The leftmost X-Forwarded-For entry is
  whatever the client wrote, so it comes last.
*/
export function clientIpFrom(h: Headers): string | null {
  if (h.get(TRUSTED_HEADER) === "1") {
    const cf = h.get("cf-connecting-ip")?.trim();
    if (cf) return cf;
  }
  const real = h.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return null;
}
