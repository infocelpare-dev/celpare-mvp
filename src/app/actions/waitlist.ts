"use server";

import { z } from "zod";
import { createAnonClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { withinBurst } from "@/lib/security/burst";

/*
  The pre launch waitlist (D198). Same shape as requestDemo: the public key may
  insert the email column of waitlist_users and nothing else, nobody can read
  it back. No email is sent, so this form cannot be used to mail a stranger.
*/

export type WaitlistState = {
  status: "idle" | "success" | "error";
  message: string;
};

const JOINED = "You're on the list.";

const schema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter your email address.")
    .max(254, "That email address is too long.")
    .email("That does not look like a valid email address."),
  // Honeypot. Real people never see this field.
  website: z.string().max(0).optional().or(z.literal("")),
});

export async function joinWaitlist(
  _prev: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  const parsed = schema.safeParse({
    email: formData.get("email") ?? "",
    website: formData.get("website") ?? "",
  });

  if (!parsed.success) {
    // A honeypot hit gets the success message, not a hint that it was caught.
    if (parsed.error.issues.some((i) => i.path[0] === "website")) {
      return { status: "success", message: JOINED };
    }
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Please check the form.",
    };
  }

  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Not connected yet. Set the Supabase keys in .env.local.",
    };
  }

  if (!(await withinBurst("waitlist"))) {
    return {
      status: "error",
      message: "Too many requests from this connection. Try again in a minute.",
    };
  }

  try {
    const supabase = createAnonClient();
    const { error } = await supabase
      .from("waitlist_users")
      .insert({ email: parsed.data.email });

    // Already on the list is still on the list; saying so would confirm who signed up.
    if (error && error.code !== "23505") {
      console.error("[waitlist] insert failed", error.code, error.message);
      return {
        status: "error",
        message: "Something went wrong on our end. Please try again.",
      };
    }

    return { status: "success", message: JOINED };
  } catch (err) {
    console.error("[waitlist] unexpected error", err);
    return {
      status: "error",
      message: "Something went wrong on our end. Please try again.",
    };
  }
}
