import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  RECOVERY_COOKIE,
  SECOND_FACTOR_COOKIE,
  hasRecovery,
  hasSecondFactor,
  needsSecondFactor,
  secondFactorEnabled,
  sessionClaims,
} from "@/lib/auth/second-factor";

/*
  Refreshes the auth session on every request and writes the rotated cookies
  back. Without this, Server Components see an expired token and the user gets
  silently logged out.

  If Supabase is not configured yet, pass through rather than throwing, so the
  marketing pages still render.
*/
export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Must be getUser, not getSession. getUser revalidates the token with the
  // auth server; getSession trusts whatever is in the cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  /*
    Password then code (D188). An email based session without the code step's
    mark is signed out: a password only session minted straight from the public
    API, or one from before the code step existed. getSession is safe to read
    here because getUser just validated the same token. Google is exempt.
  */
  if (user && secondFactorEnabled()) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const claims = sessionClaims(session?.access_token);
    /* A reset link's session may reach the new password form, nothing else (D193). */
    const onResetForm =
      claims !== null &&
      request.nextUrl.pathname.startsWith("/reset-password") &&
      (await hasRecovery(request.cookies.get(RECOVERY_COOKIE)?.value, claims.userId, claims.sessionId));
    if (
      claims &&
      needsSecondFactor(claims.methods) &&
      !onResetForm &&
      !(await hasSecondFactor(
        request.cookies.get(SECOND_FACTOR_COOKIE)?.value,
        claims.userId,
        claims.sessionId,
      ))
    ) {
      await supabase.auth.signOut({ scope: "local" });
      response.cookies.delete(SECOND_FACTOR_COOKIE);
    }
  }

  return response;
}

export const config = {
  matcher: [
    /* Everything except static assets, images, and the Sentry tunnel.

       /monitoring is where the browser posts error and trace payloads, routed
       through our own origin so an ad blocker cannot silently drop them
       (tunnelRoute in next.config.ts). Running the session refresh on it would
       put a Supabase round trip in front of every event the SDK sends, for a
       request that has no session and needs none. */
    "/((?!monitoring|_next/static|_next/image|favicon.ico|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
