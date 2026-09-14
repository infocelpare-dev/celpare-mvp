"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export type ProfileState = {
  status: "idle" | "success" | "error";
  message: string;
  field?:
    | "username"
    | "fullName"
    | "bio"
    | "location"
    | "websiteUrl"
    | "interests"
    | "skills";
};

/*
  Edit your own profile.

  This is the SECOND write path to `profiles` this codebase has ever had. Until
  now `saveAskSettings` was the only one, which meant the column grant was
  quietly backed up by there being exactly one caller. That is no longer true,
  so the rules matter more here than they did there:

    1. The update object below is a HARDCODED LITERAL. formData is never spread
       into it, and no form field name ever becomes a column name. There is no
       path by which posting `role=super_admin` reaches a column.
    2. The zod schema is an allowlist of the seven things a person may change.
    3. The database is the actual control. `plan` and `role` are absent from
       the authenticated UPDATE grant, so even if 1 and 2 were both wrong, the
       write would be refused at 42501. Verified live: task 4.7, checks V15c
       and V15d.

  A schema in the app is a convenience; the database is the control.
*/

const USERNAME = /^[a-z0-9_]{3,30}$/;

/*
  Reserved names. Not a security control, since /u/ is its own namespace and
  cannot collide with a route. This is about impersonation: an account called
  `admin` or `celpare` reads as us saying something.
*/
const RESERVED = new Set([
  "admin", "administrator", "celpare", "celpareteam", "support", "help",
  "root", "system", "moderator", "mod", "staff", "official", "security",
  "billing", "api", "www", "null", "undefined", "me",
]);

/* Commas, trimmed, blanks dropped, de-duplicated case insensitively, capped.
   The CHECK constraints cap cardinality at 20 and the joined length at 400. */
function toList(raw: string, max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const item = part.trim().replace(/\s+/g, " ");
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

const schema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(USERNAME, "Use 3 to 30 characters: lowercase letters, numbers or underscores.")
    .refine((v) => !RESERVED.has(v), "That username is reserved."),
  fullName: z.string().trim().max(120, "Keep your name under 120 characters.").optional(),
  bio: z.string().trim().max(280, "Keep your bio under 280 characters.").optional(),
  location: z.string().trim().max(80, "Keep that under 80 characters.").optional(),
  websiteUrl: z
    .string()
    .trim()
    .max(2048)
    .refine(
      (v) => v === "" || /^https?:\/\/[^\s]+$/.test(v),
      "A website must start with http:// or https://",
    )
    .optional(),
  interests: z.string().max(1000).optional(),
  skills: z.string().max(1000).optional(),
});

function blankToNull(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

export async function saveProfile(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Not connected. Set the Supabase keys in .env.local." };
  }

  const parsed = schema.safeParse({
    username: formData.get("username") ?? "",
    fullName: formData.get("fullName") ?? "",
    bio: formData.get("bio") ?? "",
    location: formData.get("location") ?? "",
    websiteUrl: formData.get("websiteUrl") ?? "",
    interests: formData.get("interests") ?? "",
    skills: formData.get("skills") ?? "",
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      status: "error",
      message: issue?.message ?? "Those details were not valid.",
      field: issue?.path[0] as ProfileState["field"],
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "Sign in to edit your profile." };
  }

  const d = parsed.data;

  const { error } = await supabase
    .from("profiles")
    .update({
      username: d.username,
      full_name: blankToNull(d.fullName),
      bio: blankToNull(d.bio),
      location: blankToNull(d.location),
      website_url: blankToNull(d.websiteUrl),
      interests: toList(d.interests ?? "", 20),
      skills: toList(d.skills ?? "", 20),
      // is_developer is deliberately NOT here. It moved to /settings, and a
      // checkbox that is no longer on this form would arrive as absent, which
      // this action would read as false and switch developer mode off on every
      // single profile save. Leaving the column out is what stops that.
    })
    .eq("id", user.id);

  if (error) {
    console.error("[profile] update failed", error.code, error.message);

    // 23505 is the unique index on username. Say so plainly rather than
    // surfacing a Postgres error to a person choosing a name.
    if (error.code === "23505") {
      return {
        status: "error",
        message: "That username is taken. Try another.",
        field: "username",
      };
    }
    // 23514 is a CHECK. The schema above should have caught every one of
    // these, so reaching here means the two disagree and the database won.
    if (error.code === "23514") {
      return { status: "error", message: "Some of those details were not accepted." };
    }
    return { status: "error", message: "Could not save that. Please try again." };
  }

  /*
    All three, and the edit page is the one that was missing. Without it the
    form kept serving the values from before the save, so coming back to it
    looked like nothing had been written even though it had.
  */
  revalidatePath("/profile/edit");
  revalidatePath("/profile");
  revalidatePath(`/u/${d.username}`);

  /*
    Then go to the profile itself. Staying on the form after a save leaves a
    person looking at the thing they just finished with, wondering whether it
    took. The profile IS the confirmation: they see the change rather than
    being told about it, which is why there is no success message to lose here.

    redirect throws, so it must sit outside any try block and after every
    write. Nothing below it runs.
  */
  redirect("/profile");
}
