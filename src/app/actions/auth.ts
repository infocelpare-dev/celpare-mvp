"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";
import { afterLogin } from "@/lib/auth/after-login";
import { withinBurst } from "@/lib/security/burst";
import { newPassword } from "@/lib/auth/password-rules";
import {
  LOGIN_PENDING_COOKIE,
  LOGIN_PENDING_TTL_S,
  SECOND_FACTOR_COOKIE,
  SECOND_FACTOR_TTL_S,
  readPendingLogin,
  secondFactorEnabled,
  sessionClaims,
  signPendingLogin,
  signSecondFactor,
} from "@/lib/auth/second-factor";
import {
  MAX_WRONG_CODES,
  countWrongCode,
  resetWrongCodes,
  wrongCodes,
} from "@/lib/auth/code-attempts";
import { isEnabled } from "@/lib/platform/settings";
import { clientIp, recordSecurityEvent } from "@/lib/telemetry";

export type AuthState = {
  status: "idle" | "error" | "success";
  message: string;
  /* Which field failed, so the form can point at it. */
  field?: "fullName" | "email" | "password" | "code" | "captcha";
  /*
    How many times this form has come back with an error. The Turnstile widget
    watches it and re-runs its challenge whenever it changes. See failed().
  */
  attempt?: number;
};

/*
  A TURNSTILE TOKEN IS SINGLE USE, AND A FAILED ATTEMPT STILL SPENDS IT.

  Supabase redeems the token at the auth endpoint before it ever looks at the
  password, so a typo in the password burns the captcha too. Nothing re-ran the
  challenge, so the form still held the spent token, the second attempt was
  refused by the captcha rather than by the password, and the only way out was
  a full page reload. The sign in copy even said "tap the box again", which the
  visitor cannot do: Cloudflare has already cleared it and there is no box.

  This was invisible in testing because Supabase captcha protection is
  currently OFF (G36), so nothing is redeeming the tokens. It would have
  appeared the moment that was turned back on, which has to happen before
  launch.

  So every error return increments a counter the widget watches. Doing it in
  one wrapper rather than at each return site means a new error branch cannot
  forget to, and there are eleven of them across these two actions.
*/
function failed(prev: AuthState, next: AuthState): AuthState {
  /*
    The count only ever goes up. A non error result carries the previous count
    forward rather than dropping it, because the widget resets on ANY change
    and a count falling back to undefined would reset it for no reason. Today
    both actions redirect on success so that branch is unreachable, which is
    exactly why it is written down: the next person to return a success state
    here should not have to rediscover it.
  */
  return next.status === "error"
    ? { ...next, attempt: (prev.attempt ?? 0) + 1 }
    : { ...next, attempt: prev.attempt };
}

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
  password: newPassword,
});

const signInSchema = z.object({
  email: z.string().trim().min(1, "Enter your email address.").email("That does not look like a valid email address."),
  password: z.string().min(1, "Enter your password."),
  /*
    Sign in needs a captcha token too, and this was the bug.

    Supabase has captcha protection enabled at the PROJECT level, which applies
    to signInWithPassword exactly as it applies to signUp. Signup sent a token
    and worked; sign in sent none, so every single login failed at the auth
    server with "captcha protection: request disallowed (no captcha_token
    found)" before any password was ever checked. Verified against the live
    endpoint.
  */
  captchaToken: z.string(),
});

const verifySchema = z.object({
  email: z.string().trim().email(),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6 digit code from your email."),
});

/*
  The client that sends codes. The service role skips Supabase captcha (G36),
  which matters because the person already passed Turnstile on the form that led
  here and a token cannot be spent twice. It only ever sends a code to an
  address that just proved its password, or to an unconfirmed signup. D188.
*/
async function codeSender() {
  return hasServiceRole() ? createAdminClient() : await createClient();
}

function isRateLimited(message: string) {
  return /rate limit|too many|security purposes/i.test(message);
}

/* "you can only request this after 80 seconds" to 80, so the person is told
   how long to wait instead of being told they hit a limit. */
function waitSeconds(message: string): number | null {
  const m = /after (\d+) seconds?/i.exec(message);
  return m ? Number(m[1]) : null;
}

function lockedMessage(login: boolean): string {
  return login
    ? "Too many wrong codes, so this one is locked. Log in again to get a new code."
    : "Too many wrong codes, so this one is locked. Send a new code below.";
}

async function setAuthCookie(name: string, value: string, maxAge: number) {
  (await cookies()).set(name, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
}

/* Marks the session the code step just created, so the proxy keeps it. */
async function grantSecondFactor(accessToken: string | undefined) {
  if (!secondFactorEnabled()) return;
  const claims = sessionClaims(accessToken);
  if (!claims) return;
  await setAuthCookie(
    SECOND_FACTOR_COOKIE,
    await signSecondFactor(claims.userId, claims.sessionId),
    SECOND_FACTOR_TTL_S,
  );
}

function firstIssue(err: z.ZodError, fallback: string): AuthState {
  const issue = err.issues[0];
  return {
    status: "error",
    message: issue?.message ?? fallback,
    field: issue?.path[0] as AuthState["field"],
  };
}

export async function signUp(
  prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  return failed(prev, await signUpImpl(formData));
}

async function signUpImpl(formData: FormData): Promise<AuthState> {
  const parsed = signUpSchema.safeParse({
    fullName: formData.get("fullName") ?? "",
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
    captchaToken: String(formData.get("captchaToken") ?? ""),
  });
  if (!parsed.success) return firstIssue(parsed.error, "Please check the form.");
  if (!isSupabaseConfigured()) return notConfigured;

  /* The flag an administrator sets in /admin/settings. Checked here rather than
     only on the page, because the page is a courtesy and the action is the
     door: hiding the form does nothing about a direct POST. */
  if (!(await isEnabled("features.public_signup"))) {
    return {
      status: "error",
      message: "New accounts are paused right now. Try again later.",
    };
  }

  const { fullName, email, password, captchaToken } = parsed.data;

  /* Signup sends a code email: the same shared quota as every auth email (D194). */
  if (!(await withinBurst("auth_email"))) {
    return {
      status: "error",
      message: "Too many sign ups from this network. Wait a few minutes, then try again.",
    };
  }

  // Enforced only when Turnstile is actually configured, so a missing key is a
  // dev convenience and never a silent hole in production.
  const captchaRequired = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
  if (captchaRequired && !captchaToken) {
    return {
      status: "error",
      field: "captcha",
      message:
        "The bot check has not passed yet. Give it a moment, and if it did not load, turn off any content blocker and reload.",
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
        message: "The bot check failed. It has reset itself, so try again.",
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
  prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  return failed(prev, await signInImpl(formData));
}

async function signInImpl(formData: FormData): Promise<AuthState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
    captchaToken: String(formData.get("captchaToken") ?? ""),
  });
  if (!parsed.success) return firstIssue(parsed.error, "Please check the form.");
  if (!isSupabaseConfigured()) return notConfigured;

  const { email, password, captchaToken } = parsed.data;

  const captchaRequired = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
  if (captchaRequired && !captchaToken) {
    return {
      status: "error",
      message:
        "The bot check has not passed yet. Give it a moment, and if it did not load, turn off any content blocker and reload.",
      field: "captcha",
    };
  }

  const supabase = await createClient();
  /* Recorded on failure only, and only ever the address that was typed. The
     password never reaches this function's log, its record or its return. */
  const ip = clientIp(await headers());

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
    ...(captchaToken ? { options: { captchaToken } } : {}),
  });

  if (error) {
    /* Nothing sends a code on this path by itself, so the person used to land on
       /verify waiting for an email that never came. Send the signup code first. */
    if (/email not confirmed/i.test(error.message)) {
      const { error: sendError } = await (await codeSender()).auth.resend({
        type: "signup",
        email,
      });
      if (sendError && !isRateLimited(sendError.message)) {
        console.error("[auth] confirmation resend failed", sendError.message);
      }
      if (!sendError) await resetWrongCodes("signup", email);
      redirect(`/verify?email=${encodeURIComponent(email)}`);
    }
    /*
      A captcha failure is NOT a wrong password, and saying so is the
      difference between a person retrying and a person giving up convinced
      their account is gone.
    */
    if (/captcha/i.test(error.message)) {
      /* Medium rather than low: a captcha that fails for a real person is a
         configuration problem the security centre should surface, and one that
         fails repeatedly is something automated being turned away. */
      void recordSecurityEvent({
        kind: "captcha_failed",
        severity: "medium",
        subject: email,
        ip,
        detail: { surface: "sign_in" },
      });
      return {
        status: "error",
        message:
          "That check did not pass. It has reset itself, so try signing in again.",
        field: "captcha",
      };
    }

    /*
      One event per failed attempt, carrying the address as typed.

      That address is a claim, not an account: it is never joined to a profile
      and the security centre shows it as a subject rather than as a person.
      Recording it is what makes a burst against one address visible, which is
      the entire reason this row exists.
    */
    void recordSecurityEvent({
      kind: "login_failed",
      severity: "low",
      subject: email,
      ip,
      detail: { surface: "sign_in" },
    });

    // Deliberately vague. Saying which of the two was wrong tells an attacker
    // whether an address is registered.
    return {
      status: "error",
      message: "That email and password do not match an account.",
    };
  }

  /* Without the secret there is nothing to sign the steps with, so local
     development without Supabase secrets keeps the old one step login. */
  if (!secondFactorEnabled()) redirect("/app");

  /*
    The password was right. That session is revoked on the auth server now, so
    it is worth nothing even if it leaked, and the real one comes from the code.
  */
  await supabase.auth.signOut({ scope: "local" });

  const { error: sendError } = await (await codeSender()).auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
  /* Rate limited means a code went out moments ago, which still works. */
  if (sendError && !isRateLimited(sendError.message)) {
    console.error("[auth] login code failed", sendError.message);
    return {
      status: "error",
      message:
        "Your password was right, but the login code could not be sent. Try again in a minute.",
    };
  }

  if (!sendError) await resetWrongCodes("login", email);
  await setAuthCookie(LOGIN_PENDING_COOKIE, await signPendingLogin(email), LOGIN_PENDING_TTL_S);
  redirect(
    `/verify?mode=login&email=${encodeURIComponent(email)}${sendError ? "&sent=recent" : ""}`,
  );
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
  const login = formData.get("mode") === "login";

  /* A code alone is not a login: the password step must have passed for this
     address, in this browser, in the last 15 minutes. */
  if (login && secondFactorEnabled()) {
    const pending = await readPendingLogin((await cookies()).get(LOGIN_PENDING_COOKIE)?.value);
    if (pending !== email.toLowerCase()) {
      return {
        status: "error",
        field: "code",
        message: "This login step has expired. Go back and enter your password again.",
      };
    }
  }

  /* Checked before Supabase is asked, so a locked code cannot be guessed at. */
  const mode = login ? "login" : "signup";
  if ((await wrongCodes(mode, email)) >= MAX_WRONG_CODES) {
    if (login) (await cookies()).delete(LOGIN_PENDING_COOKIE);
    return { status: "error", field: "code", message: lockedMessage(login) };
  }

  const supabase = await createClient();

  /*
    The type is exact on purpose. "signup" only accepts a confirmation code, so a
    login code requested straight from the API cannot finish a signup here and
    skip the password. "magiclink" is the code the login step sends.
  */
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token: code,
    type: login ? "magiclink" : "signup",
  });

  if (error) {
    const wrong = await countWrongCode(mode, email);
    if (wrong >= MAX_WRONG_CODES) {
      if (login) (await cookies()).delete(LOGIN_PENDING_COOKIE);
      return { status: "error", field: "code", message: lockedMessage(login) };
    }
    const left = MAX_WRONG_CODES - wrong;
    return {
      status: "error",
      field: "code",
      message: `That code is not right, or it has expired. ${left} ${left === 1 ? "try" : "tries"} left.`,
    };
  }

  await resetWrongCodes(mode, email);
  await grantSecondFactor(data.session?.access_token);
  /* Known browser check (New login email), and Welcome after a signup (D192). */
  if (data.user) await afterLogin(data.user, { welcome: !login });
  if (login) (await cookies()).delete(LOGIN_PENDING_COOKIE);
  redirect("/app");
}

export async function resendCode(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { status: "error", message: "Missing email address." };
  if (!isSupabaseConfigured()) return notConfigured;

  const login = formData.get("mode") === "login";

  /* This path sends with the service role, which skips Supabase captcha, and
     the signup mode accepts any address: it must be limited here (D194). */
  if (!(await withinBurst("auth_email"))) {
    return {
      status: "error",
      message: "Too many codes were asked for from this network. Wait a few minutes, then try again.",
    };
  }
  const sender = await codeSender();

  let error: { message: string } | null = null;
  if (login) {
    /* Only for the address whose password just passed, or this would email a
       login code to anyone on request. */
    const pending = secondFactorEnabled()
      ? await readPendingLogin((await cookies()).get(LOGIN_PENDING_COOKIE)?.value)
      : email.toLowerCase();
    if (pending !== email.toLowerCase()) {
      return {
        status: "error",
        message: "This login step has expired. Go back and enter your password again.",
      };
    }
    ({ error } = await sender.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    }));
  } else {
    ({ error } = await sender.auth.resend({ type: "signup", email }));
  }

  if (error) {
    if (isRateLimited(error.message)) {
      const wait = waitSeconds(error.message);
      return {
        status: "error",
        message: wait
          ? `A code was sent a moment ago and still works. You can ask for another in ${wait} seconds.`
          : "The hourly email limit was reached. Check spam for the last code, or try again later.",
      };
    }
    return { status: "error", message: "Could not send a new code." };
  }
  /* A fresh code gets fresh tries. */
  await resetWrongCodes(login ? "login" : "signup", email);
  return { status: "success", message: "New code sent. Check your inbox." };
}

export async function signOut() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}
