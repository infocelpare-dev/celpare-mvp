import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/*
  Where to go after sign in. Only a path on this site is accepted.

  `next` comes from the query string, so anybody can write it into a link. Joined
  straight onto the origin, `next=@evil.com` became `https://celpare@evil.com` and
  `next=.evil.com` became `https://celpare.evil.com`, both a different host, reached
  from a real Celpare sign in. Resolving against our own origin and comparing the
  result is the check that holds, because it asks the URL parser the same question
  the browser will.
*/
function safeNext(raw: string | null, origin: string): string {
  const fallback = "/app";
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return fallback;
  }
  try {
    const resolved = new URL(raw, origin);
    if (resolved.origin !== origin) return fallback;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}

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
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth] code exchange failed", error.message);
    return NextResponse.redirect(`${origin}/login?error=google`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
