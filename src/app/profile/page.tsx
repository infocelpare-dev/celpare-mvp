import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/app/app-shell";
import { PlaceholderPage } from "@/components/app/placeholder-page";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";

export const metadata: Metadata = {
  title: "Profile",
  // A profile page is about one person, so it stays out of the index until
  // there is a public version with its own rules.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
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
        name="Profile"
        what="Your username, your bio, the tools you saved and the posts you wrote. The public version of it lives at /u/your-username. Ask Celpare preferences are already at /settings."
        when="Phase 4, once profiles carry a username."
      />
    </AppShell>
  );
}
