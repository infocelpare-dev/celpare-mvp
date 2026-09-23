import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { Plan } from "./types";

/*
  Step 1 and 2 of the pipeline: who is asking, and on what plan.

  Anonymous visitors can use Ask Celpare (D32, D36), so there has to be a stable
  identity for someone who has no account. It is a signed httpOnly cookie, and
  the limit key mixes it with a hash of the IP so that clearing cookies does not
  hand out a fresh allowance on its own.

  The IP is hashed with a server secret and never stored raw. The project is
  hosted in eu-west-1, an IP address is personal data, and G9 still has no
  retention answer, so the shortest path is to never hold the thing in the first
  place.
*/

const COOKIE = "celpare_anon";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

let fallbackSecret: string | null = null;

function secret(): string {
  const configured = process.env.CELPARE_SECRET;
  if (configured) return configured;

  // A per process secret keeps development working without an extra env var.
  // It means anon identities do not survive a restart, which costs an anonymous
  // visitor a fresh allowance and is not worth failing the request over.
  if (!fallbackSecret) {
    fallbackSecret = randomBytes(32).toString("hex");
    console.warn("[ai] CELPARE_SECRET is not set. Anonymous identities will reset when the server restarts.");
  }
  return fallbackSecret;
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function verify(raw: string): string | null {
  const dot = raw.lastIndexOf(".");
  if (dot < 1) return null;

  const value = raw.slice(0, dot);
  const provided = raw.slice(dot + 1);
  const expected = sign(value);

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  return value;
}

export function hashIp(ip: string): string {
  return createHmac("sha256", secret()).update(ip).digest("hex").slice(0, 32);
}

/*
  cf-connecting-ip first, because Cloudflare (D15) sets it and a client cannot. The
  leftmost X-Forwarded-For entry is whatever the client wrote, and proxies append
  to it rather than replacing it, so trusting it first would let a script choose a
  new address, and a new allowance, on every request.
*/
export async function clientIp(): Promise<string> {
  const h = await headers();
  const cf = h.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const real = h.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

/* Per person Ask Celpare preferences. Every field optional: an account created
   before a setting existed simply does not have it, and the reader supplies the
   default rather than a migration backfilling every row. */
export type AskSettings = {
  answerLength?: "short" | "balanced" | "detailed";
  webSearch?: boolean;
  saveHistory?: boolean;
};

export type Identity = {
  userId: string | null;
  plan: Plan;
  bio: string | null;
  interests: string[];
  skills: string[];
  settings: AskSettings;
  /* The Redis key. Never a raw IP and never an email. */
  subject: string;
  /* Anonymous only: a second key on the hashed address alone. The cookie is minted
     by the server for anyone who arrives without one, so a script that never sends
     it would get a fresh `subject`, and a fresh allowance, on every request. This
     key is the same whatever the cookie says, which is what makes the anon limit
     a limit. Null for a signed in person, whose account id already is one. */
  ipSubject: string | null;
  anonHash: string | null;
  /* Set when a new anonymous cookie needs writing to the response. */
  setCookie?: { name: string; value: string; maxAge: number };
};

export async function identify(): Promise<Identity> {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    // getUser, not getSession: getSession trusts whatever is in the cookie.
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("plan, bio, interests, skills, ask_settings")
        .eq("id", user.id)
        .maybeSingle();

      const plan = (profile?.plan ?? "free") as Plan;
      return {
        userId: user.id,
        plan: plan === "anon" ? "free" : plan,
        bio: profile?.bio ?? null,
        interests: profile?.interests ?? [],
        skills: profile?.skills ?? [],
        settings: (profile?.ask_settings ?? {}) as AskSettings,
        subject: `u:${user.id}`,
        ipSubject: null,
        anonHash: null,
      };
    }
  }

  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value;
  const verified = existing ? verify(existing) : null;

  const id = verified ?? randomBytes(16).toString("base64url");
  const ipHash = hashIp(await clientIp());
  const anonHash = createHmac("sha256", secret()).update(`${id}:${ipHash}`).digest("hex").slice(0, 32);

  return {
    userId: null,
    plan: "anon",
    bio: null,
    interests: [],
    skills: [],
    // Anonymous visitors have no stored settings, and saveHistory is false by
    // construction rather than by preference (D36).
    settings: {},
    subject: `a:${anonHash}`,
    ipSubject: `ip:${ipHash}`,
    anonHash,
    setCookie: verified
      ? undefined
      : { name: COOKIE, value: `${id}.${sign(id)}`, maxAge: COOKIE_MAX_AGE },
  };
}
