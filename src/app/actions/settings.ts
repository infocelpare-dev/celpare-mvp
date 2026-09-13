"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export type SettingsState = {
  status: "idle" | "success" | "error";
  message: string;
};

/*
  Validated here as well as by the CHECK constraint on profiles.ask_settings.

  Both are needed and they do different jobs: this one produces a readable
  message, and the constraint is what holds when somebody posts to the REST API
  directly with the publishable key, which is public. A schema in the app is a
  convenience; the database is the control.
*/
const schema = z.object({
  answerLength: z.enum(["short", "balanced", "detailed"]),
  webSearch: z.coerce.boolean(),
  saveHistory: z.coerce.boolean(),
});

export async function saveAskSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Not connected. Set the Supabase keys in .env.local." };
  }

  const parsed = schema.safeParse({
    answerLength: formData.get("answerLength") ?? "balanced",
    // Unchecked boxes are absent from FormData, which is not the same as false
    // until it is written down.
    webSearch: formData.get("webSearch") === "on",
    saveHistory: formData.get("saveHistory") === "on",
  });

  if (!parsed.success) {
    return { status: "error", message: "Those settings were not valid." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "Sign in to change your settings." };
  }

  // The update grant on profiles lists only the columns a person may write, so
  // this cannot reach plan or role even if the payload tried.
  const { error } = await supabase
    .from("profiles")
    .update({ ask_settings: parsed.data })
    .eq("id", user.id);

  if (error) {
    console.error("[settings] update failed", error.code, error.message);
    return { status: "error", message: "Could not save that. Please try again." };
  }

  revalidatePath("/settings");
  return { status: "success", message: "Saved." };
}
