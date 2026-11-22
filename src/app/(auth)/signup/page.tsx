import type { Metadata } from "next";
import { SignupForm } from "@/components/auth/signup-form";
import { AuthDivider } from "@/components/auth/google-button";
import { GoogleButtonHere, LinkHere } from "@/components/auth/return-to-client";
import { LegalConsent } from "@/components/auth/legal-consent";

export const metadata: Metadata = {
  title: "Create your account",
  description: "Create a Celpare account and find the right AI tools.",
};

/*
  One account for everyone. There is no separate founder signup. Developer mode
  is a toggle on the profile, turned on later from inside the app.

  Prebuilt on purpose: `?next=` (the page to go back to) is read in the browser
  by the Here components and the form, see return-to-client.tsx.
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
        <GoogleButtonHere label="Continue with Google" />
        <AuthDivider />
        <SignupForm />
        <LegalConsent creating="account" />
      </div>

      <p className="mt-8 border-t border-border pt-6 text-center text-[14px] text-muted">
        Already have an account?{" "}
        <LinkHere
          href="/login"
          className="text-foreground underline underline-offset-4 transition-colors duration-200 ease-out hover:text-muted"
        >
          Log in
        </LinkHere>
      </p>
    </div>
  );
}
