import "server-only";
import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { emailWelcome, noteLogin } from "@/lib/email/dispatch";
import { clientIp } from "@/lib/telemetry";

/*
  What happens once a login is complete (D192): the browser gets a long lived
  random id, the id is recorded against the account, and a browser the account
  has not used before gets a "New login" email from noreplyaccount@. A brand new
  account also gets Welcome. Both run after the response, so login never waits.

  Called from the code step (password logins and signups) and from the Google
  callback. The id is random, not a fingerprint: it identifies this browser to
  this account and nothing else.
*/

export const DEVICE_COOKIE = "cp_device";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function browserId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(DEVICE_COOKIE)?.value;
  if (existing && UUID.test(existing)) return existing;
  const id = crypto.randomUUID();
  jar.set(DEVICE_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 400 * 86400,
  });
  return id;
}

export async function afterLogin(
  user: { id: string; email?: string; user_metadata?: Record<string, unknown> },
  opts: { welcome: boolean },
): Promise<void> {
  const h = await headers();
  const deviceId = await browserId();
  const userAgent = h.get("user-agent");
  const ip = clientIp(h);
  const meta = user.user_metadata ?? {};
  const name =
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    null;

  after(async () => {
    await noteLogin({ userId: user.id, email: user.email, deviceId, userAgent, ip });
    if (opts.welcome) await emailWelcome(user.id, user.email, name);
  });
}
