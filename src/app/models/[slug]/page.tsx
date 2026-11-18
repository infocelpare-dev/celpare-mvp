import { ModelProfilePage, modelProfileMetadata } from "./profile";

/*
  The live model profile, for signed in visitors. Signed out visitors are sent
  to /anon/models/[slug], the cached render of the same page (src/proxy.ts).
  The page itself is in ./profile.tsx.
*/

export const dynamic = "force-dynamic";

export const generateMetadata = modelProfileMetadata;

export default function ModelPage(props: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ debug?: string }>;
}) {
  return ModelProfilePage(props);
}
