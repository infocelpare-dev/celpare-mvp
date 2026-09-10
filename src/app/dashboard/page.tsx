import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Container, Section } from "@/components/ui/container";
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
  Placeholder home for a signed in user. Proves the auth round trip works end
  to end. The real dashboard (community, explore, compare, saved) is Phase 3
  onward, per docs/context/07-routes.md.
*/
export default async function DashboardPage() {
  if (!isSupabaseConfigured()) redirect("/login");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, is_developer, role")
    .eq("id", user.id)
    .single();

  const name = profile?.full_name ?? user.email;

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

      <main className="flex-1">
        <Section>
          <Container>
            <h1 className="font-display text-[28px] font-bold leading-tight">
              Welcome, {name}
            </h1>
            <p className="mt-2 text-[15px] text-muted">
              Your account is active. The rest of Celpare is still being built.
            </p>

            <dl className="mt-8 grid max-w-[520px] grid-cols-1 gap-px overflow-hidden rounded-[16px] border border-border bg-border sm:grid-cols-2">
              {[
                ["Email", profile?.email ?? user.email ?? ""],
                ["Account type", profile?.role ?? "user"],
                [
                  "Developer mode",
                  profile?.is_developer ? "On" : "Off, turn on later",
                ],
                [
                  "Signed in with",
                  user.app_metadata?.provider === "google" ? "Google" : "Email",
                ],
              ].map(([label, value]) => (
                <div key={label} className="bg-background p-4">
                  <dt className="text-[13px] text-muted">{label}</dt>
                  <dd className="mt-1 text-[15px] font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </Container>
        </Section>
      </main>
    </>
  );
}
