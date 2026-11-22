import { ModelProfilePage, modelProfileMetadata } from "@/app/models/[slug]/profile";
import { approvedSlugs } from "@/lib/catalogue/static-slugs";

/*
  The signed out model profile, rendered once and cached. Same arrangement as
  /anon/tools/[slug]: src/proxy.ts rewrites /models/<slug> here for visitors
  with no session cookie. Every approved model is built at build time and kept
  until the next deploy, the same as tools (see that file for why: the Workers
  free plan's 10 ms CPU limit).
*/

export const dynamic = "force-static";
/* Never on a timer: a stale copy started a render past the Workers free plan
   budget of 10 ms (error 1102). The next deploy rebuilds it, see
   app/anon/tools/[slug]/page.tsx. */
export const revalidate = false;

export function generateStaticParams() {
  return approvedSlugs("models");
}

export const generateMetadata = modelProfileMetadata;

export default function CachedModelPage({ params }: { params: Promise<{ slug: string }> }) {
  return ModelProfilePage({ params, cached: true });
}
