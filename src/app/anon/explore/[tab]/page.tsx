import { ExploreView, exploreMetadata } from "@/app/explore/explore-view";
import { notFound } from "next/navigation";
import { EXPLORE_TABS, isExploreTab } from "@/lib/explore/types";

/*
  The signed out Explore page, one cached copy per tab (usage audit,
  2026-11-18). src/proxy.ts rewrites /explore and /explore?tab=<tab> here for a
  visitor with no session cookie; the address bar keeps /explore.

  force-static: cookies() and headers() read as empty, which is a signed out
  visitor, the only one who reaches this route. Rankings and shelves are
  refreshed at most every five minutes.
*/

export const dynamic = "force-static";
export const revalidate = 3600;

/*
  Every tab is built at build time (Cloudflare Workers free plan: rendering
  Explore on demand needs more than the 10 ms of CPU a request may use, error
  1102). The build must have SUPABASE_SERVICE_ROLE_KEY in its environment, or
  the ranked shelves fall back to their plain order (pool.ts). A background
  refresh that fails keeps the last good copy; the next deploy rebuilds.
*/
export function generateStaticParams() {
  return EXPLORE_TABS.map((tab) => ({ tab }));
}

export const metadata = exploreMetadata;

export default async function CachedExplorePage({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  if (!isExploreTab(tab)) notFound();
  return ExploreView({ searchParams: Promise.resolve({ tab }) });
}
