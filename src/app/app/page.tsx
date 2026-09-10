import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Button, ButtonLink } from "@/components/ui/button";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";

export const metadata: Metadata = {
  // absolute, otherwise the root template "%s | Celpare" renders "Celpare | Celpare".
  title: { absolute: "Celpare" },
  robots: { index: false, follow: false },
};

// Reads the session cookie, so it must never be prerendered.
export const dynamic = "force-dynamic";

/*
  Deliberately blank. Every entry path lands here: sign up, log in, and skip.

  Skipping means no account, so this must render for a signed out visitor too.
  It never bounces back to the landing page or to explore, because a person who
  just chose to come in should not be thrown back out.

  Scope today is the landing page. The real app (community, explore, compare,
  saved, ask) is Phase 3 onward, per docs/context/07-routes.md.
*/
export default async function AppPage() {
  let signedIn = false;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    signedIn = Boolean(user);
  }

  return (
    <>
      <header className="border-b border-border">
        <Container className="flex h-[68px] items-center justify-between">
          <Logo />
          <div className="flex items-center gap-3">
            <ThemeToggle />
            {signedIn ? (
              <form action={signOut}>
                <Button variant="outline" size="sm" type="submit">
                  Log out
                </Button>
              </form>
            ) : (
              <ButtonLink href="/login" variant="outline" size="sm">
                Log in
              </ButtonLink>
            )}
          </div>
        </Container>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-20">
        <div className="max-w-[44ch] text-center">
          <h1 className="font-display text-[22px] font-semibold">
            {signedIn ? "You are signed in" : "You are browsing as a guest"}
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            Nothing here yet. Celpare is still being built.
          </p>
        </div>
      </main>
    </>
  );
}
