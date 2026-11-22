import { ToolProfilePage, toolProfileMetadata } from "@/app/tools/[slug]/profile";
import { approvedSlugs } from "@/lib/catalogue/static-slugs";

/*
  The signed out tool profile, rendered once and cached (usage audit,
  2026-11-18). src/proxy.ts rewrites /tools/<slug> here when the visitor has no
  session cookie, so the address bar still reads /tools/<slug> and the
  canonical URL stays /tools/<slug>.

  force-static: cookies() and headers() read as empty, which is exactly a
  signed out visitor.

  Every approved profile is built at build time (Cloudflare Workers free plan:
  a render on demand needs more than its 10 ms of CPU, error 1102). A tool
  approved after the build is rendered on its first visit.

  revalidate is false (2026-11-22): the copies are never refreshed on a timer,
  only by the next deploy or an admin action that calls revalidatePath. With
  3600 every copy went stale an hour after the deploy, and each visit to a
  stale copy started a background render that blew the 10 ms budget, so about
  one request in five failed with 1102 and the refresh never landed anyway.
*/

export const dynamic = "force-static";
export const revalidate = false;

export function generateStaticParams() {
  return approvedSlugs("tools");
}

export const generateMetadata = toolProfileMetadata;

export default function CachedToolPage({ params }: { params: Promise<{ slug: string }> }) {
  return ToolProfilePage({ params, cached: true });
}
