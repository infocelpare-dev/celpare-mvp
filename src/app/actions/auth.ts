"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export type AuthState = {
  status: "idle" | "error" | "success";
  message: string;
  /* Which field failed, so the form can point at it. */
  field?: "fullName" | "email" | "password" | "code" | "captcha";
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
  /*
    Turnstile token. Only required when a site key is configured, so local
    development without Cloudflare keys still works. Supabase verifies the
    token against Cloudflare, so an attacker cannot forge one.
  */
  captchaToken: z.string(),
  password: z
    .string()
    .min(10, "Use at least 10 characters.")
    .max(72, "Passwords are limited to 72 characters.")
    .regex(/[a-z]/, "Include a lowercase letter.")
    .regex(/[A-Z]/, "Include an uppercase letter.")
    .regex(/[0-9]/, "Include a number.")
    .refine(
      (v) => !COMMON_PASSWORDS.has(v.toLowerCase()),
      "That password is too common. Pick something harder to guess.",
    ),
});

/* A short deny list of the passwords that show up first in every credential
   stuffing list. Not a substitute for length, but it stops the worst choices
   at zero cost. */
const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "passw0rd", "p@ssw0rd", "p@ssword1",
  "qwerty123", "qwertyuiop", "welcome123", "admin123", "letmein123",
  "iloveyou1", "abc123456", "123456789", "1234567890", "changeme1",
  "football1", "monkey123", "dragon123", "sunshine1", "princess1",
]);

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
    captchaToken: String(formData.get("captchaToken") ?? ""),
  });
  if (!parsed.success) return firstIssue(parsed.error, "Please check the form.");
  if (!isSupabaseConfigured()) return notConfigured;

  const { fullName, email, password, captchaToken } = parsed.data;

  // Enforced only when Turnstile is actually configured, so a missing key is a
  // dev convenience and never a silent hole in production.
  const captchaRequired = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
  if (captchaRequired && !captchaToken) {
    return {
      status: "error",
      field: "captcha",
      message: "Complete the bot check before continuing.",
    };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      ...(captchaToken ? { captchaToken } : {}),
    },
  });

  /*
    Supabase does not error when the address is already registered. It returns
    a user with an empty identities array, so that nobody can probe which
    emails have accounts. Without this check the person is sent to /verify to
    wait for a code that is never sent.
  */
  if (!error && data.user && (data.user.identities?.length ?? 0) === 0) {
    return {
      status: "error",
      field: "email",
      message:
        "That email already has an account. Log in instead, and use Continue with Google if that is how you signed up.",
    };
  }

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
    /*
      Supabase's built-in email service is capped at a couple of messages per
      hour on the free tier, so this fires long before any real abuse. Saying
      "wait a minute" would be a lie. Custom SMTP removes this, see G14.
    */
    if (/rate limit|too many/i.test(error.message)) {
      return {
        status: "error",
        message:
          "Our email service has hit its hourly limit, so the code cannot be sent right now. Use Continue with Google instead, or try again later.",
      };
    }
    if (/captcha/i.test(error.message)) {
      return {
        status: "error",
        field: "captcha",
        message: "The bot check failed. Reload the page and try again.",
      };
    }
    /*
      The account cannot be created because the confirmation email cannot be
      sent. Supabase reports this as "Error sending confirmation email". It is
      not retryable from the visitor's side, so telling them to try again sends
      them round a loop that cannot end. See G14: this clears with custom SMTP.
    */
    if (/sending.*email|email.*not.*sent|smtp/i.test(error.message)) {
      return {
        status: "error",
        message:
          "We could not send the confirmation code, so the account was not created. This is our email service, not you. Use Continue with Google to get in now.",
      };
    }
    console.error("[auth] signUp failed", error.message);
    return {
      status: "error",
      message:
        "Something went wrong creating the account. Nothing was saved, so it is safe to submit again.",
    };
  }

  /*
    When "Confirm email" is off in Supabase, signUp returns a live session and
    no code is ever sent. Sending that person to /verify would strand them on a
    page waiting for an email that does not exist. Handle both configurations.
  */
  if (data.session) redirect("/app");

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

  redirect("/app");
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

  redirect("/app");
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
        message:
          "A code was just sent, or the hourly email limit was reached. Check spam, then try again later.",
      };
    }
    return { status: "error", message: "Could not send a new code." };
  }
  return { status: "success", message: "New code sent. Check your inbox." };
}

export async function signOut() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}
