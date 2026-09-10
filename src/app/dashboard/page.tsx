import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Container } from "@/components/ui/container";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Button } from "@/components/ui/button";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

// Reads the session cookie, so it must never be prerendered. Without this the
// build bakes in the signed-out redirect, because env vars are absent at build.
export const dynamic = "force-dynamic";

/*
  Deliberately empty. Scope right now is the landing page only, so this exists
  to prove the auth round trip lands somewhere real and to give a way back out.
  The actual dashboard (community, explore, compare, saved) is Phase 3 onward,
  per docs/context/07-routes.md.
*/
export default async function DashboardPage() {
  if (!isSupabaseConfigured()) redirect("/login");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <>
      <header className="border-b border-border">
        <Container className="flex h-[68px] items-center justify-between">
          <Logo />
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <form action={signOut}>
              <Button variant="outline" size="sm" type="submit">
                Log out
              </Button>
            </form>
          </div>
        </Container>
      </header>

      <main className="flex flex-1 items-center justify-center px-4">
        <div className="max-w-[42ch] text-center">
          <h1 className="font-display text-[22px] font-semibold">
            You are signed in
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            Nothing here yet. Celpare is still being built.
          </p>
        </div>
      </main>
    </>
  );
}
