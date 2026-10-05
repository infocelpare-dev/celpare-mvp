import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  RECOVERY_COOKIE,
  RECOVERY_TTL_S,
  sessionClaims,
  signRecovery,
} from "@/lib/auth/second-factor";

/*
  Where the links in account emails land (D193). The templates build them as
  <RedirectTo>&token_hash=..., so a link works in whichever browser opens it:
  a token hash is verified here, server side, with no code verifier cookie.

  recovery      "Choose a new password": opens a session that may only reach
                /reset-password (the recovery cookie, honoured by the proxy).
  email_change  "Confirm the change": with secure email change on, both the old
                and the new address get a link and both must be opened. Either
                way the person logs in again afterwards, with the address now
                on the account.
*/
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  if (!tokenHash || (type !== "recovery" && type !== "email_change")) {
    return NextResponse.redirect(`${origin}/login?notice=link-invalid`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });

  if (error) {
    console.error("[auth] link verification failed", type, error.message);
    return NextResponse.redirect(
      `${origin}${type === "recovery" ? "/forgot-password?notice=expired" : "/login?notice=link-expired"}`,
    );
  }

  if (type === "recovery") {
    const claims = sessionClaims(data.session?.access_token);
    if (!claims) return NextResponse.redirect(`${origin}/forgot-password?notice=expired`);
    (await cookies()).set(RECOVERY_COOKIE, await signRecovery(claims.userId, claims.sessionId), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: RECOVERY_TTL_S,
    });
    return NextResponse.redirect(`${origin}/reset-password`);
  }

  /* The link proves an inbox, not the password, so its session is not kept. */
  const partial = Boolean(data.user?.new_email);
  if (data.session) await supabase.auth.signOut({ scope: "local" });
  return NextResponse.redirect(
    `${origin}/login?notice=${partial ? "email-partial" : "email-changed"}`,
  );
}
