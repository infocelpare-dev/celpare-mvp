import { createHash, timingSafeEqual } from "node:crypto";

/*
  Origin authentication (D254). Production runs on a host (Netlify since
  2026-11-13, Vercel before) with Cloudflare in front. The host can also be
  reached without Cloudflare: through its own *.netlify.app or *.vercel.app
  address, or through its IP with Host: celpare.com. A request that skipped Cloudflare also skipped its rate
  limit, and could forge cf-connecting-ip to pick a new address, and a new
  allowance, on every request (D120, D121), or to write a false IP into the
  admin audit log.

  So Cloudflare proves itself: a Request Header Transform Rule adds
  x-celpare-edge with a secret only Cloudflare and the host know (EDGE_SECRET).
  src/proxy.ts asks edgeVerdict() about every request it sees:

    ok      the header matches. cf-connecting-ip can be trusted.
    off     no secret configured and not a hosted production build: local
            development, or a preview. Behaves as before.
    reject  hosted production without a matching header, or with no secret set
            at all. Fails closed: a missing secret is a configuration error the
            smoke test catches before celpare.com is switched over.

  The proxy then strips whatever a client sent in TRUSTED_HEADER and sets it
  itself, so request code can read one header instead of repeating the check.
*/

export const EDGE_HEADER = "x-celpare-edge";
export const TRUSTED_HEADER = "x-celpare-edge-trusted";

export type EdgeVerdict = "ok" | "off" | "reject";

type Env = Partial<Record<"EDGE_SECRET" | "VERCEL_ENV" | "CONTEXT" | "CELPARE_DEPLOY_CONTEXT", string>> &
  Record<string, string | undefined>;

/*
  Which deploy this is. Vercel sets VERCEL_ENV at runtime. Netlify sets CONTEXT
  at build time, and may not at runtime, so next.config.ts copies it into
  CELPARE_DEPLOY_CONTEXT, which the build writes into the code. Read here by its
  literal name so that inlining happens.
*/
const BUILT_CONTEXT = process.env.CELPARE_DEPLOY_CONTEXT;

export function isHostedProduction(env: Env): boolean {
  return (
    env.VERCEL_ENV === "production" ||
    env.CONTEXT === "production" ||
    (env.CELPARE_DEPLOY_CONTEXT ?? (env === process.env ? BUILT_CONTEXT : undefined)) === "production"
  );
}

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
  return isHostedProduction(env) ? "reject" : "off";
}

/*
  The client address, as far as it can be trusted.

  cf-connecting-ip first, but only when the proxy marked the request as having
  come through Cloudflare; otherwise anyone could set it. Then x-real-ip, which
  Netlify, Vercel and most proxies overwrite. The leftmost X-Forwarded-For entry is
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
