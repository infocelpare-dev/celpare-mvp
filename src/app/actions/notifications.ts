"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, getCurrentUser, isSupabaseConfigured } from "@/lib/supabase/server";
import { NOTIFICATION_PREFERENCES, type NotificationPreferenceKey } from "@/lib/notifications/shared";

/*
  Notifications (4BH). Both actions go through definer functions that act only
  for auth.uid(): nothing here can touch another person's rows, whatever it is
  sent. docs/context/14-notifications.md.
*/

const idsSchema = z.array(z.string().uuid()).max(200).nullable();

/* Marks the given notifications read, or every one when ids is null. */
export async function markNotificationsRead(ids: string[] | null): Promise<{ ok: boolean }> {
  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success || !isSupabaseConfigured()) return { ok: false };
  if (!(await getCurrentUser())) return { ok: false };

  const db = await createClient();
  const { error } = await db.rpc("mark_notifications_read", { p_ids: parsed.data });
  if (error) {
    console.error("[notifications] mark read failed", error.code, error.message);
    return { ok: false };
  }
  revalidatePath("/notifications");
  return { ok: true };
}

export type NotificationPreferenceState = {
  status: "idle" | "success" | "error";
  value: boolean;
  message: string;
};

const KEYS = new Set<string>(NOTIFICATION_PREFERENCES.map((p) => p.key));

/* One switch per call, the same shape as the privacy switches (D93). */
export async function setNotificationPreference(
  _prev: NotificationPreferenceState,
  formData: FormData,
): Promise<NotificationPreferenceState> {
  const key = String(formData.get("key") ?? "");
  const wanted = formData.get("value") === "on";

  if (!KEYS.has(key)) return { status: "error", value: !wanted, message: "Unknown setting." };
  if (!isSupabaseConfigured()) return { status: "error", value: !wanted, message: "Not connected." };
  if (!(await getCurrentUser())) return { status: "error", value: !wanted, message: "Sign in to change this." };

  const db = await createClient();
  const { error } = await db.rpc("set_notification_preference", {
    p_key: key as NotificationPreferenceKey,
    p_on: wanted,
  });
  if (error) {
    console.error("[notifications] preference failed", error.code, error.message);
    /* Reports the value it did NOT reach, so the switch snaps back. */
    return { status: "error", value: !wanted, message: "Could not save that. Try again." };
  }
  revalidatePath("/settings");
  return { status: "success", value: wanted, message: "Saved." };
}
