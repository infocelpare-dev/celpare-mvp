import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { afterLogin } from "@/lib/auth/after-login";
import { safeNext } from "@/lib/auth/safe-next";
import {
  GOOGLE_STATE_COOKIE,
  decodeState,
  exchangeCode,
  googleConfig,
  sameState,
} from "@/lib/auth/google-oauth";

/*
  Google sends the browser back here after /auth/google/start. The state must
  match the cookie this browser was given, the code is swapped for an ID token
  with our client secret, and Supabase checks that token and its nonce before a
  session exists. Every failure goes to /login?error=google; Google's own error
  text is logged, never shown.
*/

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);
  const saved = decodeState(request.cookies.get(GOOGLE_STATE_COOKIE)?.value);

  function fail(reason: string) {
    console.error("[auth] google callback failed:", reason);
    const res = NextResponse.redirect(`${origin}/login?error=google`, { status: 303 });
    res.cookies.delete({ name: GOOGLE_STATE_COOKIE, path: "/auth/google" });
    return res;
  }

  /* The person pressed Cancel on Google's screen: back to login, no alarm. */
  if (searchParams.get("error")) return fail(`google said ${searchParams.get("error")}`);

  const config = googleConfig();
  if (!config) return fail("not configured");
  if (!saved) return fail("no state cookie");
  if (!sameState(searchParams.get("state"), saved.state)) return fail("state mismatch");

  const code = searchParams.get("code");
  if (!code || code.length > 2048) return fail("no code");

  const exchanged = await exchangeCode({ code, origin, config });
  if ("error" in exchanged) return fail(exchanged.error);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: exchanged.idToken,
    nonce: saved.nonce,
  });
  if (error || !data.user) return fail(`supabase ${error?.message ?? "no user"}`);

  /* Google has no signup step, so an account made in the last ten minutes is
     new and gets Welcome (once per account, D192), as in /auth/callback. */
  const created = Date.parse(data.user.created_at);
  await afterLogin(data.user, { welcome: Date.now() - created < 10 * 60_000 });

  const res = NextResponse.redirect(`${origin}${safeNext(saved.next, origin)}`, { status: 303 });
  res.cookies.delete({ name: GOOGLE_STATE_COOKIE, path: "/auth/google" });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
