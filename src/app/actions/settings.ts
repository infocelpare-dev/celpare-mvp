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

export type DeveloperState = {
  status: "idle" | "success" | "error";
  isDeveloper: boolean;
  message: string;
};

/*
  Developer mode, on its own switch.

  It used to be a checkbox buried in the profile edit form, which was wrong on
  two counts: you had to open a form and save it to change a thing that is
  really a switch, and you could not see whether it was on without going in
  there. Founder instruction 2026-09-14: put it where it is visible and can be
  turned on and off directly.

  Same doctrine as saveAskSettings: a hardcoded column literal, getUser, and
  the column grant underneath. `is_developer` IS in the authenticated UPDATE
  grant, by design (D20): there is one account type, and developer mode is a
  flag a person sets themselves rather than a different kind of signup. It is
  not a privilege. It shows a badge and, later, unlocks tool submission, which
  goes through its own approval queue.
*/
export async function setDeveloperMode(
  _prev: DeveloperState,
  formData: FormData,
): Promise<DeveloperState> {
  const wanted = formData.get("isDeveloper") === "on";

  if (!isSupabaseConfigured()) {
    return { status: "error", isDeveloper: !wanted, message: "Not connected." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", isDeveloper: false, message: "Sign in to change this." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ is_developer: wanted })
    .eq("id", user.id);

  if (error) {
    console.error("[settings] developer mode failed", error.code, error.message);

    /*
      Founder rule: you cannot turn Developer Mode off once you have submitted
      tools or models, and you can while you have none. The trigger
      tg_developer_mode_guard raises developer_mode_locked with the count, so
      the message can say how many rather than just saying no.
    */
    if (error.message.includes("developer_mode_locked")) {
      const n = Number(error.message.split(":")[1] ?? 0);
      return {
        status: "error",
        isDeveloper: true,
        message:
          n === 1
            ? "You have 1 submission in the catalogue, so Developer Mode has to stay on."
            : `You have ${n} submissions in the catalogue, so Developer Mode has to stay on.`,
      };
    }

    return {
      status: "error",
      isDeveloper: !wanted,
      message: "Could not change that. Please try again.",
    };
  }

  // The badge is rendered from this flag on both profile pages.
  revalidatePath("/settings");
  revalidatePath("/profile");

  return {
    status: "success",
    isDeveloper: wanted,
    message: wanted ? "Developer mode is on." : "Developer mode is off.",
  };
}
