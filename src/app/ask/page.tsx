import type { Metadata } from "next";
import { AskChat } from "@/components/ask/ask-chat";
import { composerConfig } from "@/lib/ai/modes";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { getFeed, readerFor } from "@/lib/community/queries";
import { toTeasers, type CommunityTeaser } from "@/lib/community/teaser";
import { postIdentity } from "@/lib/community/identity";

export const metadata: Metadata = {
  title: "Ask Celpare",
  description:
    "Describe what you are trying to do and Celpare recommends the right AI tools, with the reasons.",
};

/* Reads the session cookie, so it must never be prerendered. */
export const dynamic = "force-dynamic";

export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  let signedIn = false;
  let viewerId: string | null = null;
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    signedIn = Boolean(user);
    viewerId = user?.id ?? null;
  }

  /* Which modes this plan may use, resolved here rather than in the browser.
     The community strip under the empty chat (D267) is read alongside it. */
  const [{ grants, defaults }, communityPosts] = await Promise.all([
    composerConfig(),
    recentCommunityPosts(signedIn, viewerId),
  ]);

  return (
    <AskChat
      signedIn={signedIn}
      seed={q?.slice(0, 500)}
      grants={grants}
      defaultModes={defaults}
      communityPosts={communityPosts}
    />
  );
}

/*
  The newest posts, read through the same client the feed uses for this
  visitor, so RLS shows exactly what /community would. The strip is optional:
  a failure or an empty feed renders no strip at all, never an "empty" one,
  and never stops Ask from loading.
*/
async function recentCommunityPosts(signedIn: boolean, viewerId: string | null): Promise<CommunityTeaser[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const db = await readerFor(signedIn);
    const posts = await getFeed(db, { sort: "new", scope: "for-you", viewerId });
    return toTeasers(posts, (post) => postIdentity(post).name);
  } catch (err) {
    console.error("[ask] community strip failed", err);
    return [];
  }
}
