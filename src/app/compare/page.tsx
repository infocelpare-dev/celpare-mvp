import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/app/app-shell";
import { PlaceholderPage } from "@/components/app/placeholder-page";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";

export const metadata: Metadata = {
  title: "Compare",
  description: "Put AI tools side by side and see what actually differs.",
};

/* Reads the session cookie, so it must never be prerendered. */
export const dynamic = "force-dynamic";

export default async function ComparePage() {
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
      <PlaceholderPage
        name="Compare"
        what="Pick two or three tools and see them side by side: what they cost, what they do, and where they actually differ. Ask Celpare can already compare them in prose, at /ask."
        when="Phase 5, with the rest of the directory."
      />
    </AppShell>
  );
}
