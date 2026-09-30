import "server-only";
import { bump } from "@/lib/ai/ratelimit";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";
import {
  describeBrowser,
  developerVerifiedEmail,
  maskIp,
  newFollowerEmail,
  newLoginEmail,
  reportEmail,
  toolDecisionEmail,
  toolSubmittedEmail,
  welcomeEmail,
  type Decision,
  type ReportInput,
} from "./messages";
import { REPORTS_INBOX, sendEmail } from "./send";

/*
  Who gets each app email, and whether they may (D191). Every function here is
  called inside after(), never awaited by the person, and never throws.

  Recipient addresses of OTHER people (a tool's owner, the person followed) are
  read with the service role, the third narrow use after D21 and D188 (D190):
  only the address, only to send this one email, never returned to a browser.
*/

async function addressOf(userId: string): Promise<string | null> {
  if (!hasServiceRole()) return null;
  const { data, error } = await createAdminClient().auth.admin.getUserById(userId);
  if (error) {
    console.error("[email] recipient lookup failed", error.message);
    return null;
  }
  return data.user?.email ?? null;
}

/* True the first time only: guards emails that must never repeat. */
async function once(key: string, ttlSeconds: number): Promise<boolean> {
  try {
    return (await bump(key, 1, ttlSeconds)) === 1;
  } catch (err) {
    console.error("[email] once guard unavailable, skipped", key, err);
    return false;
  }
}

/*
  For emails that must arrive exactly once (Welcome, Developer verified): the
  mark is made only AFTER a successful send. Marking first meant a send that
  was skipped (no key yet, budget full) or failed burned the one chance for good.
*/
async function alreadySent(key: string): Promise<boolean> {
  try {
    return (await bump(key, 0, 400 * 86400)) > 0;
  } catch (err) {
    console.error("[email] sent mark unavailable, skipped", key, err);
    return true;
  }
}

async function markSent(key: string): Promise<void> {
  try {
    await bump(key, 1, 400 * 86400);
  } catch (err) {
    console.error("[email] sent mark not saved", key, err);
  }
}

function safely(label: string, fn: () => Promise<unknown>): Promise<void> {
  return fn().then(
    () => undefined,
    (err) => console.error(`[email] ${label} failed`, err),
  );
}

/* --------------------------------------------------------------- reports */

export function emailReport(r: Omit<ReportInput, "itemPath" | "at"> & { toolSlug?: string }) {
  return safely("report", async () => {
    let itemPath: string | null = null;
    if (r.entityType === "post") itemPath = `/community/${r.entityId}`;
    if (r.entityType === "tool" && r.toolSlug) itemPath = `/tools/${r.toolSlug}`;
    if (r.entityType === "comment" && hasServiceRole()) {
      const { data } = await createAdminClient()
        .from("comments")
        .select("post_id")
        .eq("id", r.entityId)
        .maybeSingle();
      if (data?.post_id) itemPath = `/community/${data.post_id}`;
    }
    await sendEmail(REPORTS_INBOX, reportEmail({ ...r, itemPath, at: new Date() }));
  });
}

/* --------------------------------------------------------------- account */

export function emailWelcome(userId: string, to: string | undefined, name: string | null) {
  return safely("welcome", async () => {
    if (!to) return;
    const key = `email:welcome-sent:${userId}`;
    if (await alreadySent(key)) return;
    if ((await sendEmail(to, welcomeEmail(name))) === "sent") await markSent(key);
  });
}

/*
  A browser is known by a random id in a long lived cookie. A login from an id
  this account has not used before is recorded, and emailed about unless it is
  the account's very first browser (that one is the signup itself).
*/
export async function noteLogin(input: {
  userId: string;
  email: string | undefined;
  deviceId: string;
  userAgent: string | null;
  ip: string | null;
}): Promise<void> {
  return safely("new login", async () => {
    if (!hasServiceRole()) return;
    const db = createAdminClient();
    const { data: seen } = await db
      .from("known_devices")
      .select("device_id")
      .eq("user_id", input.userId)
      .eq("device_id", input.deviceId)
      .maybeSingle();

    if (seen) {
      await db
        .from("known_devices")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("user_id", input.userId)
        .eq("device_id", input.deviceId);
      return;
    }

    const { count } = await db
      .from("known_devices")
      .select("device_id", { count: "exact", head: true })
      .eq("user_id", input.userId);

    const { error } = await db.from("known_devices").insert({
      user_id: input.userId,
      device_id: input.deviceId,
      user_agent: input.userAgent?.slice(0, 400) ?? null,
    });
    if (error) {
      console.error("[email] device not recorded", error.code, error.message);
      return;
    }

    if ((count ?? 0) > 0 && input.email) {
      await sendEmail(
        input.email,
        newLoginEmail({ at: new Date(), browser: describeBrowser(input.userAgent), ip: maskIp(input.ip) }),
      );
    }
  });
}

/* ----------------------------------------------------------- submissions */

async function listing(kind: "tool" | "model", id: string) {
  if (!hasServiceRole()) return null;
  const { data } = await createAdminClient()
    .from(kind === "tool" ? "tools" : "models")
    .select("name, slug, developer_id")
    .eq("id", id)
    .maybeSingle();
  return data as { name: string; slug: string; developer_id: string | null } | null;
}

export function emailToolSubmitted(to: string | undefined, kind: "tool" | "model", id: string) {
  return safely("tool submitted", async () => {
    const row = await listing(kind, id);
    if (!to || !row) return;
    await sendEmail(to, toolSubmittedEmail(kind, row.name));
  });
}

export function emailToolDecision(
  kind: "tool" | "model",
  id: string,
  decision: Decision,
  reason: string | null,
) {
  return safely("tool decision", async () => {
    const row = await listing(kind, id);
    if (!row?.developer_id) return;
    const livePath = `/${kind === "tool" ? "tools" : "models"}/${row.slug}`;
    const email = toolDecisionEmail(kind, row.name, decision, reason, livePath);
    const to = email ? await addressOf(row.developer_id) : null;
    if (email && to) await sendEmail(to, email);
  });
}

export function emailDeveloperVerified(developerId: string) {
  return safely("developer verified", async () => {
    if (!hasServiceRole()) return;
    const key = `email:dev-verified-sent:${developerId}`;
    if (await alreadySent(key)) return;
    const { data } = await createAdminClient()
      .from("developer_profiles")
      .select("display_name")
      .eq("id", developerId)
      .maybeSingle();
    const to = await addressOf(developerId);
    if (to && (await sendEmail(to, developerVerifiedEmail(data?.display_name ?? null))) === "sent") {
      await markSent(key);
    }
  });
}

/* ------------------------------------------------------------- community */

/*
  One email per follower and person per day, at most five a day to anyone,
  and never when the person switched it off or muted the follower (the same
  mute notify() honours).
*/
export function emailNewFollower(followerId: string, targetId: string) {
  return safely("new follower", async () => {
    if (!hasServiceRole()) return;
    const db = createAdminClient();

    const [{ data: pref }, { data: muted }] = await Promise.all([
      db.from("notification_preferences").select("email_follows").eq("user_id", targetId).maybeSingle(),
      db
        .from("feed_feedback")
        .select("user_id")
        .eq("user_id", targetId)
        .eq("target_type", "author")
        .eq("kind", "mute")
        .eq("target_id", followerId)
        .maybeSingle(),
    ]);
    if (pref?.email_follows === false || muted) return;

    const day = new Date().toISOString().slice(0, 10);
    if (!(await once(`email:follow-pair:${followerId}:${targetId}:${day}`, 2 * 86400))) return;
    try {
      if ((await bump(`email:follow-to:${targetId}:${day}`, 1, 2 * 86400)) > 5) return;
    } catch {
      return;
    }

    const [{ data: follower }, to] = await Promise.all([
      db.from("profiles").select("full_name, username").eq("id", followerId).maybeSingle(),
      addressOf(targetId),
    ]);
    if (to) {
      await sendEmail(
        to,
        newFollowerEmail({ name: follower?.full_name ?? null, username: follower?.username ?? null }),
      );
    }
  });
}
