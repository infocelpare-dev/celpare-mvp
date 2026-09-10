import type { Metadata } from "next";
import Link from "next/link";
import { WaitlistForm } from "@/components/landing/waitlist-form";

export const metadata: Metadata = {
  title: "Get started",
  description:
    "Create your Celpare account and start finding the right AI tools.",
};

/*
  Accounts are not open yet, so this page says so plainly and collects an email
  for early access instead of showing a password field that cannot work.
  Swap for real Supabase Auth in Phase 3.
*/
export default function SignupPage() {
  return (
    <div>
      <h1 className="font-display text-[28px] font-bold leading-tight">
        Get started with Celpare
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        Accounts are not open to everyone yet. Leave your email and we will let
        you in as soon as they are, with no waiting once you are through.
      </p>

      <div className="mt-8">
        <WaitlistForm />
      </div>

      <p className="mt-8 border-t border-border pt-6 text-[14px] text-muted">
        Already have access?{" "}
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
