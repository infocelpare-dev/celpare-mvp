"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, getCurrentUser, isSupabaseConfigured } from "@/lib/supabase/server";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";
import { newPassword } from "@/lib/auth/password-rules";
import {
  RECOVERY_COOKIE,
  SECOND_FACTOR_COOKIE,
  hasRecovery,
  sessionClaims,
} from "@/lib/auth/second-factor";
import { siteUrl } from "@/lib/email/layout";
import { withinBurst } from "@/lib/security/burst";

/*
  Password and email changes (D193). Every email here is sent by Supabase from
  noreplyaccount@celpare.com with the Celpare templates:

  - Forgot password and Change password both send "Choose a new password", a
    link to /auth/confirm, which opens the New password and Confirm password
    form. Supabase then replaces the old password and sends "Password changed".
  - Change email sends "Confirm the change" to the old and the new address
    (secure email change), then "Email address changed" to the old one.
*/

export type AccountState = {
  status: "idle" | "success" | "error";
  message: string;
  field?: "email" | "password" | "confirm" | "captcha";
  attempt?: number;
};

const RESET_REDIRECT = () => siteUrl("/auth/confirm?type=recovery");
const EMAIL_REDIRECT = () => siteUrl("/auth/confirm?type=email_change");

function bump(prev: AccountState, next: AccountState): AccountState {
  return next.status === "error" ? { ...next, attempt: (prev.attempt ?? 0) + 1 } : next;
}

/* ---------------------------------------------------- forgot password */

const forgotSchema = z.object({
  email: z.string().trim().min(1, "Enter your email address.").email("That does not look like a valid email address."),
  captchaToken: z.string(),
});

/*
  The answer is the same whether or not the address has an account, so this
  form cannot be used to find out who is registered.
*/
export async function requestPasswordReset(prev: AccountState, formData: FormData): Promise<AccountState> {
  const parsed = forgotSchema.safeParse({
    email: formData.get("email") ?? "",
    captchaToken: String(formData.get("captchaToken") ?? ""),
  });
  if (!parsed.success) {
    return bump(prev, { status: "error", field: "email", message: parsed.error.issues[0]?.message ?? "Check the address." });
  }
  if (!isSupabaseConfigured()) return bump(prev, { status: "error", message: "Not connected." });

  const { email, captchaToken } = parsed.data;
  /* Public, and Supabase captcha is off (G36): without this anyone could
     spend the shared email quota or flood a stranger's inbox (D194). */
  if (!(await withinBurst("auth_email"))) {
    return bump(prev, { status: "error", message: "Too many emails were asked for from this network. Wait a few minutes, then try again." });
  }
  if (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && !captchaToken) {
    return bump(prev, {
      status: "error",
      field: "captcha",
      message: "The bot check has not passed yet. Give it a moment, then try again.",
    });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: RESET_REDIRECT(),
    ...(captchaToken ? { captchaToken } : {}),
  });

  if (error) {
    if (/captcha/i.test(error.message)) {
      return bump(prev, { status: "error", field: "captcha", message: "That check did not pass. It has reset itself, so try again." });
    }
    /* Rate limits and unknown addresses fall through to the same answer. */
    console.error("[account] reset request failed", error.message);
  }

  return {
    status: "success",
    message: "If an account uses that address, a link to choose a new password is on its way. It works for one hour.",
  };
}

/* ------------------------------------------- change password, signed in */

/*
  Change password in Settings sends the same link to the address on the
  account. Signed in already, so the service role sends it and Supabase captcha
  (G36) does not stand in the way.
*/
export async function sendPasswordChangeLink(): Promise<AccountState> {
  if (!isSupabaseConfigured()) return { status: "error", message: "Not connected." };
  const user = await getCurrentUser();
  if (!user?.email) return { status: "error", message: "Sign in to change your password." };
  if (!(await withinBurst("auth_email"))) return { status: "error", message: "Too many emails were asked for from this network. Wait a few minutes, then try again." };

  const client = hasServiceRole() ? createAdminClient() : await createClient();
  const { error } = await client.auth.resetPasswordForEmail(user.email, { redirectTo: RESET_REDIRECT() });
  if (error) {
    if (/rate limit|security purposes|too many/i.test(error.message)) {
      /* Supabase allows one email per address per minute, and a login code
         counts, so this is usually "you just logged in". Say how long. */
      const wait = /after (\d+) seconds?/i.exec(error.message)?.[1];
      return {
        status: "error",
        message: wait
          ? `We emailed you less than a minute ago (your login code counts). Try again in ${wait} seconds.`
          : "Too many emails were sent to you in the last hour. Try again later.",
      };
    }
    console.error("[account] change password link failed", error.message);
    return { status: "error", message: "The link could not be sent. Try again in a minute." };
  }
  return {
    status: "success",
    message: `We sent a link to ${user.email}. Open it to choose a new password. It expires in 1 hour.`,
  };
}

/* --------------------------------------------------- choose new password */

const resetSchema = z
  .object({ password: newPassword, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "The two passwords do not match.", path: ["confirm"] });

export async function resetPassword(prev: AccountState, formData: FormData): Promise<AccountState> {
  const parsed = resetSchema.safeParse({
    password: formData.get("password") ?? "",
    confirm: formData.get("confirm") ?? "",
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return bump(prev, {
      status: "error",
      field: issue?.path[0] === "confirm" ? "confirm" : "password",
      message: issue?.message ?? "Check the password.",
    });
  }
  if (!isSupabaseConfigured()) return bump(prev, { status: "error", message: "Not connected." });

  const supabase = await createClient();
  const jar = await cookies();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const claims = sessionClaims(session?.access_token);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  /* Only the session a reset link opened, in this browser, may do this. */
  if (!user || !claims || !(await hasRecovery(jar.get(RECOVERY_COOKIE)?.value, claims.userId, claims.sessionId))) {
    redirect("/forgot-password?notice=expired");
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (/same|different from the old/i.test(error.message)) {
      return bump(prev, { status: "error", field: "password", message: "Choose a password you have not used on this account." });
    }
    if (/weak|pwned|known/i.test(error.message)) {
      return bump(prev, { status: "error", field: "password", message: "That password is too easy to guess. Pick another." });
    }
    console.error("[account] password update failed", error.message);
    return bump(prev, { status: "error", message: "The password could not be changed. Open the link again and retry." });
  }

  /* Every session ends, including other devices, so an old password or a
     stolen session is worthless now. Supabase sends "Password changed". */
  await supabase.auth.signOut({ scope: "global" });
  jar.delete(RECOVERY_COOKIE);
  jar.delete(SECOND_FACTOR_COOKIE);
  redirect("/login?notice=password-changed");
}

/* ------------------------------------------------------------ change email */

const emailSchema = z.object({
  email: z.string().trim().min(1, "Enter the new address.").max(254).email("That does not look like a valid email address."),
});

export async function changeEmail(prev: AccountState, formData: FormData): Promise<AccountState> {
  const parsed = emailSchema.safeParse({ email: formData.get("email") ?? "" });
  if (!parsed.success) {
    return bump(prev, { status: "error", field: "email", message: parsed.error.issues[0]?.message ?? "Check the address." });
  }
  if (!isSupabaseConfigured()) return bump(prev, { status: "error", message: "Not connected." });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return bump(prev, { status: "error", message: "Sign in to change your email." });

  if (!(await withinBurst("auth_email"))) return bump(prev, { status: "error", message: "Too many emails were asked for from this network. Wait a few minutes, then try again." });

  const next = parsed.data.email.toLowerCase();
  if (next === user.email?.toLowerCase()) {
    return bump(prev, { status: "error", field: "email", message: "That is already the address on your account." });
  }

  const { error } = await supabase.auth.updateUser({ email: next }, { emailRedirectTo: EMAIL_REDIRECT() });
  if (error) {
    if (/already|registered|exists/i.test(error.message)) {
      return bump(prev, { status: "error", field: "email", message: "Another account already uses that address." });
    }
    if (/rate limit|security purposes|too many/i.test(error.message)) {
      return bump(prev, { status: "error", message: "A confirmation was sent a moment ago. Check both inboxes, or try again in a few minutes." });
    }
    console.error("[account] email change failed", error.message);
    return bump(prev, { status: "error", message: "The change could not be started. Try again in a minute." });
  }

  return {
    status: "success",
    message: `Almost done. We sent a link to ${user.email} and to ${next}. Open both to finish. Nothing changes until you do.`,
  };
}
