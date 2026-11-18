import { ExploreView, exploreMetadata } from "./explore-view";

/*
  The live Explore page. Reads the session cookie, so it must never be
  prerendered. A signed out visitor on a plain tab address is sent to
  /anon/explore/[tab], the cached render of the same page (src/proxy.ts).
  The page itself is in ./explore-view.tsx.
*/
export const dynamic = "force-dynamic";

export const metadata = exploreMetadata;

export default function ExplorePage({ searchParams }: PageProps<"/explore">) {
  return ExploreView({ searchParams });
}
