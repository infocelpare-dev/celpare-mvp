"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export type AuthState = {
  status: "idle" | "error" | "success";
  message: string;
  /* Which field failed, so the form can point at it. */
  field?: "fullName" | "email" | "password" | "code";
};

const notConfigured: AuthState = {
  status: "error",
  message:
    "Sign in is not connected yet. Set the Supabase keys in .env.local and restart the dev server.",
};

/*
  One account type for everyone. There is no founder signup and no user signup,
  just a Celpare account. Developer mode is a flag on the profile that gets
  turned on from inside the app later.
*/
const signUpSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Enter your name.")
    .max(120, "That name is too long."),
  email: z
    .string()
    .trim()
    .min(1, "Enter your email address.")
    .max(254, "That email address is too long.")
    .email("That does not look like a valid email address."),
  password: z
    .string()
    .min(8, "Use at least 8 characters.")
    .max(72, "Passwords are limited to 72 characters."),
});

const signInSchema = z.object({
  email: z.string().trim().min(1, "Enter your email address.").email("That does not look like a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

const verifySchema = z.object({
  email: z.string().trim().email(),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6 digit code from your email."),
});

function firstIssue(err: z.ZodError, fallback: string): AuthState {
  const issue = err.issues[0];
  return {
    status: "error",
    message: issue?.message ?? fallback,
    field: issue?.path[0] as AuthState["field"],
  };
}

export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = signUpSchema.safeParse({
    fullName: formData.get("fullName") ?? "",
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
  });
  if (!parsed.success) return firstIssue(parsed.error, "Please check the form.");
  if (!isSupabaseConfigured()) return notConfigured;

  const { fullName, email, password } = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });

  if (error) {
    // Supabase returns this when the address is already registered and
    // confirmations are on. Saying so plainly is more useful than hiding it,
    // and the address is one the person just typed.
    if (/already registered|already been registered/i.test(error.message)) {
      return {
        status: "error",
        field: "email",
        message: "That email already has an account. Try logging in instead.",
      };
    }
    if (/rate limit|too many/i.test(error.message)) {
      return {
        status: "error",
        message: "Too many attempts. Wait a minute and try again.",
      };
    }
    console.error("[auth] signUp failed", error.message);
    return { status: "error", message: "Could not create the account. Please try again." };
  }

  redirect(`/verify?email=${encodeURIComponent(email)}`);
}

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
  });
  if (!parsed.success) return firstIssue(parsed.error, "Please check the form.");
  if (!isSupabaseConfigured()) return notConfigured;

  const { email, password } = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (/email not confirmed/i.test(error.message)) {
      redirect(`/verify?email=${encodeURIComponent(email)}`);
    }
    // Deliberately vague. Saying which of the two was wrong tells an attacker
    // whether an address is registered.
    return {
      status: "error",
      message: "That email and password do not match an account.",
    };
  }

  redirect("/dashboard");
}

export async function verifyCode(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = verifySchema.safeParse({
    email: formData.get("email") ?? "",
    code: formData.get("code") ?? "",
  });
  if (!parsed.success) return firstIssue(parsed.error, "Enter the 6 digit code.");
  if (!isSupabaseConfigured()) return notConfigured;

  const { email, code } = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase.auth.verifyOtp({
    email,
    token: code,
    type: "email",
  });

  if (error) {
    return {
      status: "error",
      field: "code",
      message: "That code is wrong or has expired. Ask for a new one.",
    };
  }

  redirect("/dashboard");
}

export async function resendCode(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { status: "error", message: "Missing email address." };
  if (!isSupabaseConfigured()) return notConfigured;

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ type: "signup", email });

  if (error) {
    if (/rate limit|too many|security purposes/i.test(error.message)) {
      return {
        status: "error",
        message: "A code was just sent. Wait a minute before asking for another.",
      };
    }
    return { status: "error", message: "Could not send a new code." };
  }
  return { status: "success", message: "New code sent. Check your inbox." };
}

export async function signInWithGoogle() {
  if (!isSupabaseConfigured()) return;

  const supabase = await createClient();
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (await headers()).get("origin") ??
    "http://localhost:3000";

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback`,
      queryParams: { access_type: "offline", prompt: "consent" },
    },
  });

  if (error || !data.url) {
    redirect("/login?error=google");
  }
  redirect(data.url);
}

export async function signOut() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}
