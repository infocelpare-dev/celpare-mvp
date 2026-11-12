import type { Metadata } from "next";
import { AskChat } from "@/components/ask/ask-chat";
import { composerConfig } from "@/lib/ai/modes";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

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
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    signedIn = Boolean(user);
  }

  /* Which modes this plan may use, resolved here rather than in the browser. */
  const { grants, defaults } = await composerConfig();

  return (
    <AskChat
      signedIn={signedIn}
      seed={q?.slice(0, 500)}
      grants={grants}
      defaultModes={defaults}
    />
  );
}
