import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminScopedClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { clientIp } from "@/lib/telemetry";
import {
  capabilitiesFor,
  isStaffRole,
  type Capability,
  type StaffRole,
} from "./capabilities";

/*
  The server side gate on /admin.

  It is the second control, not the only one. Every RPC the dashboard calls
  checks the same capability again in SQL, so a page that rendered when it should
  not have still cannot read or write anything. That redundancy is the point: a
  routing mistake becomes an empty page rather than a breach.

  Fails closed at every step. No Supabase, no session, no profile row, a
  suspended staff account, or a role that is not staff all end in the same place:
  not here.
*/

export type AdminSession = {
  userId: string;
  role: StaffRole;
  username: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  email: string;
  capabilities: Capability[];
  can: (capability: Capability) => boolean;
  db: SupabaseClient;
};

/*
  Resolves the admin session, or null.

  Reads profiles through the caller's own session rather than the service role,
  so this is subject to RLS like everything else. profiles.role is readable to
  authenticated by policy, and unwritable by column grant, which is what makes
  reading it here safe: a person can see their own role and cannot change it.
*/
export async function getAdminSession(): Promise<AdminSession | null> {
  if (!isSupabaseConfigured()) return null;

  /*
    The admin's own address, forwarded to the database under our own header so
    the audit log can record who acted from where.

    Without this the audit log recorded the wrong address entirely, and it was
    not obvious: admin_audit read x-forwarded-for out of PostgREST's request
    headers, which is set by Supabase's edge to the IP of whatever called it.
    That caller is this Next.js server, not the administrator's browser. In
    development the two are the same machine, so the value looked plausible
    while being meaningless; deployed, every entry would have carried the
    serverless egress IP, and somebody investigating an incident would have
    chased it.

    Read server side from the incoming request and re-sent under a name only we
    set, so a browser cannot choose what lands in the log by sending its own.
  */
  const ip = clientIp(await headers());
  const db = await createAdminScopedClient(ip);
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return null;

  const { data: profile, error } = await db
    .from("profiles")
    .select("id, username, full_name, avatar_url, role, account_status")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile) return null;
  // A suspended admin is not an admin. has_admin_capability() says the same
  // thing in SQL; saying it here too means the shell never renders for one.
  if (profile.account_status !== "active") return null;
  if (!isStaffRole(profile.role)) return null;

  const capabilities = capabilitiesFor(profile.role);

  return {
    userId: user.id,
    role: profile.role,
    username: profile.username,
    fullName: profile.full_name,
    avatarUrl: profile.avatar_url,
    // From the auth session, not from the profiles row: profiles.email is not
    // in the client SELECT grant, and this is the admin's own address anyway.
    email: user.email ?? "",
    capabilities,
    can: (capability) => capabilities.includes(capability),
    db,
  };
}

/*
  For a page. Redirects rather than throwing, because a person who is not an
  admin should land somewhere real instead of on an error.

  /community rather than a 403 page on purpose: telling somebody that /admin
  exists and refused them is more information than telling them nothing.
*/
export async function requireAdmin(capability?: Capability): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) redirect("/community");
  if (capability && !session.can(capability)) redirect("/admin");
  return session;
}

/*
  For a server action. Returns a discriminated result instead of redirecting, so
  the action can answer with a message the form can render.
*/
export async function adminActionSession(
  capability: Capability,
): Promise<{ ok: true; session: AdminSession } | { ok: false; message: string }> {
  const session = await getAdminSession();
  if (!session) return { ok: false, message: "Not signed in as an administrator." };
  if (!session.can(capability)) {
    return { ok: false, message: "Your role does not allow that." };
  }
  return { ok: true, session };
}
