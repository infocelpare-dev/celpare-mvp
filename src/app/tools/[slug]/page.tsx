import { ToolProfilePage, toolProfileMetadata } from "./profile";

/*
  The live tool profile, for signed in visitors. Signed out visitors are sent
  to /anon/tools/[slug], the cached render of the same page (src/proxy.ts).
  The page itself is in ./profile.tsx.
*/

export const dynamic = "force-dynamic";

export const generateMetadata = toolProfileMetadata;

export default function ToolPage(props: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ debug?: string }>;
}) {
  return ToolProfilePage(props);
}
