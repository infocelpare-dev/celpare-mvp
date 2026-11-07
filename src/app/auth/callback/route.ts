import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { afterLogin } from "@/lib/auth/after-login";
import { safeNext } from "@/lib/auth/safe-next";

/* OAuth and email-link return path. Exchanges the code for a session, then
   sends the user into the app. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"), origin);

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=google`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth] code exchange failed", error.message);
    return NextResponse.redirect(`${origin}/login?error=google`);
  }

  /* Google has no signup step, so an account made in the last ten minutes is a
     new one and gets Welcome; the send itself is once per account (D192). */
  if (data.user) {
    const created = Date.parse(data.user.created_at);
    await afterLogin(data.user, { welcome: Date.now() - created < 10 * 60_000 });
  }

  return NextResponse.redirect(`${origin}${next}`);
}
