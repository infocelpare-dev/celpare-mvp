"use server";

import { z } from "zod";
import { getSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase/server";

export type WaitlistState = {
  status: "idle" | "success" | "error";
  message: string;
};

const schema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter your email address.")
    .max(254, "That email address is too long.")
    .email("That does not look like a valid email address."),
  audience: z.enum(["user", "founder"]),
  company: z.string().trim().max(120).optional().or(z.literal("")),
  // Honeypot. Real people never see this field, so anything in it is a bot.
  website: z.string().max(0).optional().or(z.literal("")),
});

export async function joinWaitlist(
  _prev: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  const parsed = schema.safeParse({
    email: formData.get("email") ?? "",
    audience: formData.get("audience") ?? "user",
    company: formData.get("company") ?? "",
    website: formData.get("website") ?? "",
  });

  if (!parsed.success) {
    // The honeypot is the only field a real user cannot see, so a failure
    // there gets the success message rather than a hint that it was caught.
    if (parsed.error.issues.some((i) => i.path[0] === "website")) {
      return { status: "success", message: "You are on the list." };
    }
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Please check the form.",
    };
  }

  const { email, audience, company } = parsed.data;

  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message:
        "The waitlist is not connected yet. Set the Supabase keys in .env.local.",
    };
  }

  try {
    const supabase = getSupabaseServerClient();
    const table = audience === "founder" ? "waitlist_founders" : "waitlist_users";

    const row: Record<string, string> = { email, source: "landing" };
    if (audience === "founder" && company) row.company = company;

    const { error } = await supabase.from(table).insert(row);

    if (error) {
      // 23505 is a unique violation, meaning they already signed up. That is
      // not a failure from the visitor's point of view.
      if (error.code === "23505") {
        return { status: "success", message: "You are already on the list." };
      }
      console.error("[waitlist] insert failed", {
        code: error.code,
        message: error.message,
      });
      return {
        status: "error",
        message: "Something went wrong on our end. Please try again.",
      };
    }

    return { status: "success", message: "You are on the list. Talk soon." };
  } catch (err) {
    console.error("[waitlist] unexpected error", err);
    return {
      status: "error",
      message: "Something went wrong on our end. Please try again.",
    };
  }
}
