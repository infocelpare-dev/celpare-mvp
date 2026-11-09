/*
  Sign in with Google as a full page redirect on celpare.com (founder,
  2026-11-09: tapping the button goes straight to Google, and Google's screen
  names celpare.com, not the Supabase project address).

  The authorization code flow, run by our own server:

  1. /auth/google/start makes a random state and a random nonce, keeps both in
     a short lived httpOnly cookie, and redirects to Google with the state and
     the SHA-256 of the nonce. redirect_uri is /auth/google/callback on our own
     origin, which is why Google's screen says celpare.com.
  2. /auth/google/callback checks the state against the cookie (so a callback
     this browser did not start is refused), swaps the code for Google's ID
     token with the client secret, and hands the token and the RAW nonce to
     Supabase signInWithIdToken. Supabase hashes the raw nonce and compares it
     with the claim in the token, the same check the earlier popup flow used.

  The cookie is SameSite=Lax: Google returns with a top level GET, which Lax
  cookies are sent on. Nothing here is a secret worth signing: the values are
  random, single use and only ever compared with what the same browser sent.

  Without GOOGLE_CLIENT_SECRET the start route falls back to the Supabase
  redirect flow, so sign in never depends on this being configured.
*/

export const GOOGLE_STATE_COOKIE = "cp_google_oauth";
export const GOOGLE_STATE_TTL_S = 10 * 60;
export const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_CALLBACK_PATH = "/auth/google/callback";

export type GoogleConfig = { clientId: string; clientSecret: string };

/* Both halves or nothing. The client id is the public one the app already has. */
export function googleConfig(env: Record<string, string | undefined> = process.env): GoogleConfig | null {
  const clientId = env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export type GoogleState = { state: string; nonce: string; next: string };

const HEX64 = /^[0-9a-f]{64}$/;

export function encodeState(s: GoogleState): string {
  return encodeURIComponent(JSON.stringify(s));
}

/* Anything malformed reads as no state, which the callback refuses. */
export function decodeState(raw: string | undefined): GoogleState | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(decodeURIComponent(raw)) as Partial<GoogleState>;
    if (
      typeof v.state !== "string" ||
      typeof v.nonce !== "string" ||
      typeof v.next !== "string" ||
      !HEX64.test(v.state) ||
      !HEX64.test(v.nonce)
    ) {
      return null;
    }
    return { state: v.state, nonce: v.nonce, next: v.next };
  } catch {
    return null;
  }
}

/* Constant time, so a near miss on the state takes as long as a miss. */
export function sameState(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function authorizeUrl(opts: {
  clientId: string;
  origin: string;
  state: string;
  hashedNonce: string;
}): string {
  const u = new URL(GOOGLE_AUTHORIZE_URL);
  u.searchParams.set("client_id", opts.clientId);
  u.searchParams.set("redirect_uri", `${opts.origin}${GOOGLE_CALLBACK_PATH}`);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("state", opts.state);
  u.searchParams.set("nonce", opts.hashedNonce);
  /* The account chooser every time, so a shared computer does not silently
     sign in as whoever used Google last. */
  u.searchParams.set("prompt", "select_account");
  return u.toString();
}

/* Swaps the code for Google's ID token. Returns null on any failure; the
   reason is logged by the caller, never shown to the person. */
export async function exchangeCode(opts: {
  code: string;
  origin: string;
  config: GoogleConfig;
  fetchImpl?: typeof fetch;
}): Promise<{ idToken: string } | { error: string }> {
  const body = new URLSearchParams({
    code: opts.code,
    client_id: opts.config.clientId,
    client_secret: opts.config.clientSecret,
    redirect_uri: `${opts.origin}${GOOGLE_CALLBACK_PATH}`,
    grant_type: "authorization_code",
  });
  try {
    const res = await (opts.fetchImpl ?? fetch)(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
    const data = (await res.json().catch(() => null)) as { id_token?: unknown; error?: unknown } | null;
    if (!res.ok || typeof data?.id_token !== "string") {
      return { error: `token ${res.status} ${typeof data?.error === "string" ? data.error : ""}`.trim() };
    }
    return { idToken: data.id_token };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "fetch failed" };
  }
}
