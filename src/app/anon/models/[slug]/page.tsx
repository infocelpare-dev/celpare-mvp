import { ModelProfilePage, modelProfileMetadata } from "@/app/models/[slug]/profile";
import { approvedSlugs } from "@/lib/catalogue/static-slugs";

/*
  The signed out model profile, rendered once and cached. Same arrangement as
  /anon/tools/[slug]: src/proxy.ts rewrites /models/<slug> here for visitors
  with no session cookie. Every approved model is built at build time and a
  copy is refreshed in the background at most hourly, the same as tools (see
  that file for why: the Workers free plan's 10 ms CPU limit).
*/

export const dynamic = "force-static";
export const revalidate = 3600;

export function generateStaticParams() {
  return approvedSlugs("models");
}

export const generateMetadata = modelProfileMetadata;

export default function CachedModelPage({ params }: { params: Promise<{ slug: string }> }) {
  return ModelProfilePage({ params, cached: true });
}
