import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { afterLogin } from "@/lib/auth/after-login";
import { safeNext } from "@/lib/auth/safe-next";
import { withinBurst } from "@/lib/security/burst";

/*
  Sign in with Google's own button, on celpare.com.

  The redirect flow (signInWithOAuth) sends people through the Supabase project
  address, so Google's account chooser said "to continue to
  uckulakdtmaqgwakowyq.supabase.co". With Google Identity Services the browser
  gets a Google ID token on our own origin and posts it here; Supabase verifies
  it (signature, audience against the configured Google client id, and the
  nonce) and the session cookies are set by this response, exactly as
  /auth/callback sets them. afterLogin then runs the same Welcome, new login
  and plans steps.

  Accepts only a same origin JSON POST. The token is single use in practice:
  its nonce is the hash of a value only the posting page knew. Nothing from
  Google's error text reaches the client.
*/

export const dynamic = "force-dynamic";

const MAX_TOKEN = 4096;

export async function POST(request: NextRequest) {
  const origin = new URL(request.url).origin;

  // CSRF: a browser always sends Origin on a cross site POST.
  const sentOrigin = request.headers.get("origin");
  if (sentOrigin !== origin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!(await withinBurst("google_signin"))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const { credential, nonce, next } = (body ?? {}) as Record<string, unknown>;
  if (
    typeof credential !== "string" ||
    credential.length === 0 ||
    credential.length > MAX_TOKEN ||
    typeof nonce !== "string" ||
    !/^[0-9a-f]{64}$/.test(nonce)
  ) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: credential,
    nonce,
  });

  if (error || !data.user) {
    console.error("[auth] google id token sign in failed", error?.message);
    return NextResponse.json({ error: "google_failed" }, { status: 401 });
  }

  /* Same rule as /auth/callback: Google has no signup step, so an account made
     in the last ten minutes is new and gets Welcome (once per account, D192). */
  const created = Date.parse(data.user.created_at);
  await afterLogin(data.user, { welcome: Date.now() - created < 10 * 60_000 });

  return NextResponse.json(
    { next: safeNext(typeof next === "string" ? next : null, origin) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
