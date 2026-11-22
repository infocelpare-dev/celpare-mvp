import LiveAskPage, { metadata as liveMetadata } from "@/app/ask/page";

/*
  The signed out /ask with no query parameters, built at build time
  (Cloudflare Workers free plan, 2026-11-18: rendered on demand it needs more
  than the 10 ms of CPU a request may use). src/proxy.ts rewrites a visitor
  with no session cookie here only when the address has no query string, so
  every query still reaches the live page. Same component, rendered with no
  cookies and no parameters, which is what that visitor always got.
*/

export const dynamic = "force-static";
/* Never on a timer: a stale copy started a render past the Workers free plan
   budget of 10 ms (error 1102). The next deploy rebuilds it, see
   app/anon/tools/[slug]/page.tsx. */
export const revalidate = false;

export const metadata = liveMetadata;

export default function CachedAskPage() {
  return LiveAskPage({ params: Promise.resolve({}), searchParams: Promise.resolve({}) } as Parameters<typeof LiveAskPage>[0]);
}
