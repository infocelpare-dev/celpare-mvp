import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ResetForm } from "@/components/auth/reset-form";
import { RECOVERY_COOKIE, hasRecovery, sessionClaims } from "@/lib/auth/second-factor";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false, follow: false },
};

/* Reached only from the link in "Choose a new password" (D193). Anyone else is
   sent to ask for a link, rather than shown a form that cannot work. */
export default async function ResetPasswordPage() {
  if (!isSupabaseConfigured()) redirect("/forgot-password");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const claims = sessionClaims(session?.access_token);
  const ok =
    user &&
    claims &&
    (await hasRecovery((await cookies()).get(RECOVERY_COOKIE)?.value, claims.userId, claims.sessionId));
  if (!ok) redirect("/forgot-password?notice=expired");

  return (
    <div>
      <h1 className="font-display text-[28px] font-bold leading-tight">Choose a new password</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">
        For <span className="font-medium text-foreground">{user.email}</span>. When it is saved you
        will be logged out everywhere and can log in with the new one.
      </p>
      <div className="mt-8">
        <ResetForm />
      </div>
    </div>
  );
}
