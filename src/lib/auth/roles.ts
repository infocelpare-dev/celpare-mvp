import type { SupabaseClient } from "@supabase/supabase-js";

/*
  Roles come from profile_roles(), never from a select on profiles.role.

  The column was readable by anyone, so one anonymous request named the
  super_admin account (SEC.7, 2026-11-10). The function answers your own role
  always and other people's only for active staff, and the column grant is
  revoked once nothing selects it.

  A failed read gives an empty map, so a role check fails closed: no admin link,
  no admin shell, the plain "user" badge.
*/
export async function rolesFor(
  db: SupabaseClient,
  ids: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((v): v is string => Boolean(v)))].slice(0, 200);
  if (unique.length === 0) return new Map();
  const { data, error } = await db.rpc("profile_roles", { p_ids: unique });
  if (error) {
    console.error("[auth] profile_roles failed", error.code, error.message);
    return new Map();
  }
  return new Map(((data ?? []) as { id: string; role: string }[]).map((r) => [r.id, r.role]));
}

/* The signed in person's own role, or "user" when it cannot be read. */
export async function myRole(db: SupabaseClient, userId: string): Promise<string> {
  return (await rolesFor(db, [userId])).get(userId) ?? "user";
}
