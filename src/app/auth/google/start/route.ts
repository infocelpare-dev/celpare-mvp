import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";
import { withinBurst } from "@/lib/security/burst";
import {
  GOOGLE_STATE_COOKIE,
  GOOGLE_STATE_TTL_S,
  authorizeUrl,
  encodeState,
  googleConfig,
  randomHex,
  sha256Hex,
} from "@/lib/auth/google-oauth";

/*
  "Continue with Google" is a plain link here, so one tap is one redirect to
  Google (lib/auth/google-oauth.ts has the whole flow). With GOOGLE_CLIENT_SECRET
  set it is our own code flow on celpare.com; without it, the Supabase redirect
  flow as before, so the button always works.
*/

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);
  const next = safeNext(searchParams.get("next"), origin);

  if (!(await withinBurst("google_signin"))) {
    return NextResponse.redirect(`${origin}/login?error=google`, { status: 303 });
  }

  const config = googleConfig();

  if (!config) {
    /* The fallback: Supabase's own redirect, back to /auth/callback. Started on
       the server, so the PKCE verifier lands in a cookie the callback reads. */
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
        queryParams: { prompt: "select_account" },
        skipBrowserRedirect: true,
      },
    });
    if (error || !data.url) {
      console.error("[auth] google redirect could not start", error?.message);
      return NextResponse.redirect(`${origin}/login?error=google`, { status: 303 });
    }
    return NextResponse.redirect(data.url, { status: 303 });
  }

  const state = randomHex(32);
  const nonce = randomHex(32);
  const response = NextResponse.redirect(
    authorizeUrl({ clientId: config.clientId, origin, state, hashedNonce: await sha256Hex(nonce) }),
    { status: 303 },
  );
  response.cookies.set(GOOGLE_STATE_COOKIE, encodeState({ state, nonce, next }), {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https:"),
    path: "/auth/google",
    maxAge: GOOGLE_STATE_TTL_S,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
