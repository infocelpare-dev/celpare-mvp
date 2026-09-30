import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";
import { GoogleButton, AuthDivider } from "@/components/auth/google-button";
import { FormAlert } from "@/components/ui/field";

export const metadata: Metadata = {
  title: "Log in",
  description: "Log in to Celpare.",
};

/* Where the account email flows end (D193). Fixed sentences only: the query
   string picks one, it never supplies the words. */
const NOTICES: Record<string, { tone: "success" | "error"; text: string }> = {
  "password-changed": { tone: "success", text: "Your password was changed and every session was logged out. Log in with the new one." },
  "email-changed": { tone: "success", text: "Your email address was changed. Log in with the new address." },
  "email-partial": { tone: "success", text: "One address confirmed. Open the link we sent to the other address to finish the change." },
  "link-expired": { tone: "error", text: "That link has expired or was already used. Start again from Settings." },
  "link-invalid": { tone: "error", text: "That link is not complete. Open it again from the email." },
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const oauthFailed = params?.error === "google";
  const notice = typeof params?.notice === "string" ? NOTICES[params.notice] : undefined;

  return (
    <div>
      <h1 className="font-display text-[28px] font-bold leading-tight">
        Log in to Celpare
      </h1>
      <p className="mt-2 text-[15px] text-muted">
        Welcome back.
      </p>

      {notice && (
        <div className="mt-6">
          <FormAlert tone={notice.tone}>{notice.text}</FormAlert>
        </div>
      )}

      {oauthFailed && (
        <div className="mt-6">
          <FormAlert>
            Google sign in did not complete. Try again, or use your email and
            password.
          </FormAlert>
        </div>
      )}

      <div className="mt-8">
        <GoogleButton label="Continue with Google" />
        <AuthDivider />
        <LoginForm />
        <p className="mt-4 text-center text-[14px]">
          <Link
            href="/forgot-password"
            className="text-muted underline underline-offset-4 transition-colors duration-200 ease-out hover:text-foreground"
          >
            Forgot password?
          </Link>
        </p>
      </div>

      <p className="mt-6 text-center text-[14px] text-muted">
        <Link
          href="/app"
          className="underline underline-offset-4 transition-colors duration-200 ease-out hover:text-foreground"
        >
          Skip for now and look around
        </Link>
      </p>

      <p className="mt-8 border-t border-border pt-6 text-center text-[14px] text-muted">
        New to Celpare?{" "}
        <Link
          href="/signup"
          className="text-foreground underline underline-offset-4 transition-colors duration-200 ease-out hover:text-muted"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
