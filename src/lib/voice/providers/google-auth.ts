/*
  A Google OAuth access token from a service account key, with no SDK (guide 21).

  This is Google's documented server to server flow ("Using OAuth 2.0 for
  Server to Server Applications"): sign a JWT with the service account's
  private key (RS256), exchange it at oauth2.googleapis.com/token for an access
  token with the cloud-platform scope, and reuse that token until shortly
  before it expires. Web Crypto does the signing, so the same code runs on Node
  and on Cloudflare Workers (D15), where Google's Node SDKs fit poorly.

  The key never leaves this module: not in a log, not in an error, not in a
  response. Errors say what kind of thing failed, never the key or the token.
*/

export type ServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

export class CredentialsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialsError";
  }
}

/* Raw JSON, or the same JSON base64 encoded (easier to paste into a dashboard). */
export function parseServiceAccount(raw: string): ServiceAccount {
  let text = raw.trim();
  if (!text.startsWith("{")) {
    try {
      text = new TextDecoder().decode(fromBase64(text));
    } catch {
      throw new CredentialsError("credentials are neither JSON nor base64 JSON");
    }
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new CredentialsError("credentials are not valid JSON");
  }
  const sa = parsed as Partial<ServiceAccount> & { type?: string };
  if (sa.type !== undefined && sa.type !== "service_account") {
    throw new CredentialsError("credentials are not a service account key");
  }
  if (typeof sa.client_email !== "string" || typeof sa.private_key !== "string") {
    throw new CredentialsError("credentials are missing client_email or private_key");
  }
  return { client_email: sa.client_email, private_key: sa.private_key, token_uri: sa.token_uri };
}

export function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64.replace(/\s+/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function base64url(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importKey(pem: string): Promise<CryptoKey> {
  /* PEM armour lines are dropped by shape (five dashes either side), and the
     literal backslash-n pairs left by a key pasted into a one line variable. */
  const body = pem
    .replace(/-{5}[A-Z ]+-{5}/g, "")
    .replace(/\\n/g, "")
    .replace(/\s+/g, "");
  try {
    return await crypto.subtle.importKey(
      "pkcs8",
      fromBase64(body),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
  } catch {
    throw new CredentialsError("private_key could not be read as a PKCS#8 RSA key");
  }
}

export async function signJwt(sa: ServiceAccount, scope: string, nowSeconds: number): Promise<string> {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope,
      aud: sa.token_uri ?? "https://oauth2.googleapis.com/token",
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    }),
  );
  const key = await importKey(sa.private_key);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`));
  return `${header}.${claims}.${base64url(new Uint8Array(signature))}`;
}

type Cached = { token: string; expiresAt: number; email: string };
let cache: Cached | null = null;

/* For tests. */
export function clearTokenCache() {
  cache = null;
}

export async function accessToken(
  sa: ServiceAccount,
  deps: { fetch: typeof fetch; now: () => number; signal?: AbortSignal },
): Promise<string> {
  const now = deps.now();
  /* Reused until a minute before expiry. */
  if (cache && cache.email === sa.client_email && cache.expiresAt - 60_000 > now) return cache.token;

  const assertion = await signJwt(sa, "https://www.googleapis.com/auth/cloud-platform", Math.floor(now / 1000));
  const res = await deps.fetch(sa.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
    signal: deps.signal,
  });
  if (!res.ok) {
    /* 400 invalid_grant is a wrong, revoked or clock skewed key. The body is
       not passed on: it can name the account. */
    throw new CredentialsError(`token exchange refused (${res.status})`);
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new CredentialsError("token exchange returned no token");
  cache = { token: data.access_token, expiresAt: now + (data.expires_in ?? 3600) * 1000, email: sa.client_email };
  return data.access_token;
}
