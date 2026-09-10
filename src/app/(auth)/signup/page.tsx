import type { Metadata } from "next";
import Link from "next/link";
import { SignupForm } from "@/components/auth/signup-form";
import { GoogleButton, AuthDivider } from "@/components/auth/google-button";

export const metadata: Metadata = {
  title: "Create your account",
  description: "Create a Celpare account and find the right AI tools.",
};

/*
  One account for everyone. There is no separate founder signup. Developer mode
  is a toggle on the profile, turned on later from inside the app.
*/
export default function SignupPage() {
  return (
    <div>
      <h1 className="font-display text-[28px] font-bold leading-tight">
        Create your account
      </h1>
      <p className="mt-2 text-[15px] text-muted">
        Free to start. No card required.
      </p>

      <div className="mt-8">
        <GoogleButton label="Continue with Google" />
        <AuthDivider />
        <SignupForm />
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
        Already have an account?{" "}
        <Link
          href="/login"
          className="text-foreground underline underline-offset-4 transition-colors duration-200 ease-out hover:text-muted"
        >
          Log in
        </Link>
      </p>
    </div>
  );
}
