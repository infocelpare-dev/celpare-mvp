import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    /* Everything except static assets and images. */
    "/((?!_next/static|_next/image|favicon.ico|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
