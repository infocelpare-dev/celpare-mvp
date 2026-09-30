/*
  Password, then an emailed code (D188).

  Supabase has no email second factor, and its API is public: anyone holding
  the publishable key can get a password only session from /token, or a code
  only session from /otp. So the two steps are enforced here, with two signed
  cookies:

  1. cp_login_pending: set when the password was right. It names the address
     and lives 15 minutes. The code step refuses to finish a login without it,
     so a code alone (someone with the inbox but not the password) is not enough.
  2. cp_2fa: set when the code was right. It is bound to the Supabase session id,
     so it cannot be carried to another session. The middleware signs out every
     email based session that lacks it, which covers a password only session
     minted straight from the API and every session from before this existed.

  Google sessions are exempt: Google is the second party there.

  Limit, written down so nobody assumes more: this guards the app. A password
  only token used directly against the REST API still passes RLS until it
  expires. Closing that needs Supabase MFA (TOTP) and aal2 policies.

  Web Crypto only, because the middleware imports this too.
*/

export const LOGIN_PENDING_COOKIE = "cp_login_pending";
export const SECOND_FACTOR_COOKIE = "cp_2fa";
export const LOGIN_PENDING_TTL_S = 15 * 60;
/* The cookie outlives nothing that matters: it is bound to one session id, so
   it dies with the session whatever this says. */
export const SECOND_FACTOR_TTL_S = 60 * 60 * 24 * 30;

const encoder = new TextEncoder();
let keyPromise: Promise<CryptoKey> | null = null;

/* Derived from the service role key with a label, so no new env var is needed
   and the value is useless for anything but this. No key, no enforcement: local
   development without Supabase secrets keeps working. */
function secret(): string | null {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return k ? `celpare-second-factor-v1:${k}` : null;
}

export function secondFactorEnabled(): boolean {
  return secret() !== null;
}

function key(): Promise<CryptoKey> {
  const s = secret();
  if (!s) throw new Error("Second factor secret is not configured.");
  keyPromise ??= crypto.subtle.importKey(
    "raw",
    encoder.encode(s),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return keyPromise;
}

function toB64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): string {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

async function sign(payload: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await key(), encoder.encode(payload));
  return toB64url(new Uint8Array(sig));
}

/* Constant time over the whole string, so a near miss takes as long as a miss. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function nowS(now: number): number {
  return Math.floor(now / 1000);
}

export async function signPendingLogin(email: string, now = Date.now()): Promise<string> {
  const e = toB64url(encoder.encode(email.trim().toLowerCase()));
  const exp = nowS(now) + LOGIN_PENDING_TTL_S;
  return `${e}.${exp}.${await sign(`pending|${e}|${exp}`)}`;
}

/* The address the password step was passed for, or null. */
export async function readPendingLogin(
  value: string | undefined,
  now = Date.now(),
): Promise<string | null> {
  if (!value || !secondFactorEnabled()) return null;
  const [e, exp, sig] = value.split(".");
  if (!e || !exp || !sig || !/^\d+$/.test(exp)) return null;
  if (Number(exp) < nowS(now)) return null;
  if (!same(sig, await sign(`pending|${e}|${exp}`))) return null;
  try {
    return fromB64url(e);
  } catch {
    return null;
  }
}

export async function signSecondFactor(
  userId: string,
  sessionId: string,
  now = Date.now(),
): Promise<string> {
  const exp = nowS(now) + SECOND_FACTOR_TTL_S;
  return `${exp}.${await sign(`2fa|${userId}|${sessionId}|${exp}`)}`;
}

export async function hasSecondFactor(
  value: string | undefined,
  userId: string,
  sessionId: string,
  now = Date.now(),
): Promise<boolean> {
  if (!value) return false;
  const [exp, sig] = value.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  if (Number(exp) < nowS(now)) return false;
  return same(sig, await sign(`2fa|${userId}|${sessionId}|${exp}`));
}

/*
  A reset link (D193) proves the inbox, not the password, so the session it
  opens may reach /reset-password and nothing else. This cookie says the link
  was opened in this browser, for this session, in the last 30 minutes. The
  middleware honours it on /reset-password only.
*/
export const RECOVERY_COOKIE = "cp_recovery";
export const RECOVERY_TTL_S = 30 * 60;

export async function signRecovery(userId: string, sessionId: string, now = Date.now()): Promise<string> {
  const exp = nowS(now) + RECOVERY_TTL_S;
  return `${exp}.${await sign(`recovery|${userId}|${sessionId}|${exp}`)}`;
}

export async function hasRecovery(
  value: string | undefined,
  userId: string,
  sessionId: string,
  now = Date.now(),
): Promise<boolean> {
  if (!value || !secondFactorEnabled()) return false;
  const [exp, sig] = value.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  if (Number(exp) < nowS(now)) return false;
  return same(sig, await sign(`recovery|${userId}|${sessionId}|${exp}`));
}

export type SessionClaims = { userId: string; sessionId: string; methods: string[] };

/* Reads the access token's own claims. Only call it on a token the auth server
   has already validated (after getUser, or straight from verifyOtp). */
export function sessionClaims(accessToken: string | undefined): SessionClaims | null {
  const part = accessToken?.split(".")[1];
  if (!part) return null;
  try {
    const c = JSON.parse(fromB64url(part)) as {
      sub?: string;
      session_id?: string;
      amr?: { method?: string }[];
    };
    if (!c.sub || !c.session_id) return null;
    const methods = (c.amr ?? []).map((a) => String(a.method ?? ""));
    return { userId: c.sub, sessionId: c.session_id, methods };
  } catch {
    return null;
  }
}

/* Every email based session needs the code step. Google (oauth) and SSO do not. */
export function needsSecondFactor(methods: string[]): boolean {
  return !methods.some((m) => m === "oauth" || m.startsWith("sso"));
}

/* "ameagmahad@gmail.com" to "am***d@gmail.com", for the code screen. Enough to
   tell two addresses at the same provider apart, which "a***" was not. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  if (local.length <= 3) return `${local[0]}***@${domain}`;
  return `${local.slice(0, 2)}***${local.slice(-1)}@${domain}`;
}
