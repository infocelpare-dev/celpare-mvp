import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Log in",
  description: "Log in to Celpare.",
};

/*
  No auth backend yet, so this does not pretend to have one. A fake email and
  password form that always fails is worse than an honest message.
  Replaced by real Supabase Auth in Phase 3.
*/
export default function LoginPage() {
  return (
    <div>
      <h1 className="font-display text-[28px] font-bold leading-tight">
        Log in to Celpare
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        Logging in is not available yet. Celpare is still being built, and
        accounts open with early access.
      </p>

      <div className="mt-8 rounded-[16px] border border-border p-6">
        <h2 className="font-display text-[15px] font-semibold">
          Want in early?
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          Leave your email and you will be among the first to get an account.
        </p>
        <ButtonLink href="/signup" className="mt-5 w-full">
          Get early access
        </ButtonLink>
      </div>

      <p className="mt-8 border-t border-border pt-6 text-[14px] text-muted">
        Questions?{" "}
        <Link
          href="mailto:infocelpare@gmail.com"
          className="text-foreground underline underline-offset-4 transition-colors duration-200 ease-out hover:text-muted"
        >
          Get in touch
        </Link>
      </p>
    </div>
  );
}
