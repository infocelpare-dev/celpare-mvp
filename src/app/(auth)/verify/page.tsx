import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { VerifyForm } from "@/components/auth/verify-form";
import { FormAlert } from "@/components/ui/field";
import { maskEmail } from "@/lib/auth/second-factor";

export const metadata: Metadata = {
  title: "Confirm your email",
  robots: { index: false, follow: false },
};

export default async function VerifyPage({ searchParams }: PageProps<"/verify">) {
  const params = await searchParams;
  const email = typeof params?.email === "string" ? params.email : "";
  /* Step two of password then code (D188). The action checks the password step
     really passed; this only decides the words. */
  const login = params?.mode === "login";
  const sentRecently = params?.sent === "recent";

  // Nothing to verify without an address, so send them back rather than
  // showing an input that cannot work.
  if (!email) redirect(login ? "/login" : "/signup");

  return (
    <div>
      {login && (
        <p className="text-[13px] font-medium text-muted">Step 2 of 2</p>
      )}
      <h1 className="font-display text-[28px] font-bold leading-tight">
        {login ? "Check your email" : "Confirm your email"}
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">
        We sent a 6 digit code to{" "}
        <span className="font-medium text-foreground">
          {login ? maskEmail(email) : email}
        </span>
        .{" "}
        {login
          ? "Enter it below to log in."
          : "Enter it below to finish creating your account."}
      </p>

      {sentRecently && (
        <div className="mt-6">
          <FormAlert tone="success">
            A code was sent a moment ago, so use that one. It still works.
          </FormAlert>
        </div>
      )}

      <div className="mt-8">
        <VerifyForm email={email} mode={login ? "login" : "signup"} />
      </div>

      <p className="mt-8 border-t border-border pt-6 text-center text-[14px] text-muted">
        {login ? "Not you?" : "Wrong address?"}{" "}
        <Link
          href={login ? "/login" : "/signup"}
          className="text-foreground underline underline-offset-4 transition-colors duration-200 ease-out hover:text-muted"
        >
          {login ? "Back to log in" : "Start again"}
        </Link>
      </p>
    </div>
  );
}
