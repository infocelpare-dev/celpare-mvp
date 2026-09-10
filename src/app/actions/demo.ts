"use server";

import { z } from "zod";
import { createAnonClient, isSupabaseConfigured } from "@/lib/supabase/server";

export type DemoState = {
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
  // Honeypot. Real people never see this field.
  website: z.string().max(0).optional().or(z.literal("")),
});

export async function requestDemo(
  _prev: DemoState,
  formData: FormData,
): Promise<DemoState> {
  const parsed = schema.safeParse({
    email: formData.get("email") ?? "",
    website: formData.get("website") ?? "",
  });

  if (!parsed.success) {
    // A honeypot hit gets the success message, not a hint that it was caught.
    if (parsed.error.issues.some((i) => i.path[0] === "website")) {
      return { status: "success", message: "Thanks. Check your inbox shortly." };
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

  try {
    const supabase = createAnonClient();
    const { error } = await supabase
      .from("demo_requests")
      .insert({ email: parsed.data.email, source: "landing" });

    if (error && error.code !== "23505") {
      console.error("[demo] insert failed", error.code, error.message);
      return {
        status: "error",
        message: "Something went wrong on our end. Please try again.",
      };
    }

    return {
      status: "success",
      message: "Thanks. We will send the demo and docs to that address.",
    };
  } catch (err) {
    console.error("[demo] unexpected error", err);
    return {
      status: "error",
      message: "Something went wrong on our end. Please try again.",
    };
  }
}
