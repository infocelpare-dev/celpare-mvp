import type { Metadata } from "next";
import { MessagesSquare } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/app/app-shell";
import { SparkIcon } from "@/components/ui/spark-icon";
import { AskBox } from "@/components/ask/ask-box";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";

export const metadata: Metadata = {
  title: { absolute: "Celpare" },
  description:
    "The home for AI tools. Ask Celpare what you need, and see what the community is building.",
};

/* Reads the session cookie, so it must never be prerendered. */
export const dynamic = "force-dynamic";

/*
  The Celpare homepage (D27).

  Community is the home, and Ask Celpare is a section of it: the founder's
  instruction on 2026-09-13 was that the assistant belongs here and in the
  product navigation, not on the marketing page.

  The feed itself is Phase 4A and is not built. Rather than filling the space
  with invented posts, which D30 forbids, the page says plainly what is coming
  and gives the one thing that does work. That is also the honest answer to the
  cold start problem in 10-community.md section 11: a feed with no posts is the
  worst possible first screen, so the assistant leads instead.
*/
export default async function CommunityPage() {
  let signedIn = false;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    signedIn = Boolean(user);
  }

  return (
    <AppShell
      signedIn={signedIn}
      signOutAction={
        <form action={signOut}>
          <Button variant="outline" size="sm" type="submit">
            Log out
          </Button>
        </form>
      }
    >
      <Container className="max-w-[760px] py-10 sm:py-16">
        <section aria-labelledby="ask-heading">
          <div className="mb-3 flex items-center gap-2 text-[13px] font-medium text-muted">
            <SparkIcon className="size-3.5 text-accent" />
            Ask Celpare
          </div>

          <h1
            id="ask-heading"
            className="font-display text-[clamp(1.7rem,4.5vw,2.4rem)] font-semibold leading-tight"
          >
            What are you trying to build?
          </h1>

          <p className="mt-3 max-w-[54ch] text-[15px] leading-relaxed text-muted">
            Describe the job and Celpare recommends the tools that fit, with the
            reasons. It answers on AI tools, models, tech and SaaS, from the
            Celpare catalogue, its own documentation and the web.
          </p>

          <div className="mt-6">
            <AskBox />
          </div>

          {!signedIn ? (
            <p className="mt-3 text-[13px] text-muted">
              You can ask without an account. Chats are not saved unless you sign in.
            </p>
          ) : null}
        </section>

        <section aria-labelledby="feed-heading" className="mt-14 sm:mt-20">
          <h2
            id="feed-heading"
            className="font-display text-[20px] font-semibold"
          >
            Community
          </h2>

          {/*
            The empty state, designed rather than improvised, because at
            launch this is the state every visitor sees. It does not fake
            activity and it does not pretend the feed exists.
          */}
          <div className="mt-4 rounded-2xl border border-border px-5 py-8 text-center sm:px-8 sm:py-10">
            <MessagesSquare className="mx-auto size-6 text-muted" aria-hidden />
            <p className="mx-auto mt-4 max-w-[46ch] text-[15px] leading-relaxed text-muted">
              The community feed is being built. It will be where people share
              what they found, ask which tool fits, and post what they shipped.
            </p>
            <p className="mx-auto mt-2 max-w-[46ch] text-[13px] text-muted">
              Nothing here is a placeholder for posts that do not exist yet.
            </p>
          </div>
        </section>
      </Container>
    </AppShell>
  );
}
