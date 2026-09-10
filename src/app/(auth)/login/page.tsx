import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";
import { GoogleButton, AuthDivider } from "@/components/auth/google-button";
import { FormAlert } from "@/components/ui/field";

export const metadata: Metadata = {
  title: "Log in",
  description: "Log in to Celpare.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const oauthFailed = params?.error === "google";

  return (
    <div>
      <h1 className="font-display text-[28px] font-bold leading-tight">
        Log in to Celpare
      </h1>
      <p className="mt-2 text-[15px] text-muted">
        Welcome back.
      </p>

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
      </div>

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
