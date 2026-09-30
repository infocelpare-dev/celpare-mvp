import type { Metadata } from "next";
import Link from "next/link";
import { ForgotForm } from "@/components/auth/forgot-form";
import { FormAlert } from "@/components/ui/field";

export const metadata: Metadata = {
  title: "Forgot password",
  robots: { index: false, follow: false },
};

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  const params = await searchParams;
  const expired = params?.notice === "expired";

  return (
    <div>
      <h1 className="font-display text-[28px] font-bold leading-tight">Forgot your password?</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">
        Enter the email on your account. We will send a link to choose a new password.
      </p>

      {expired && (
        <div className="mt-6">
          <FormAlert>That link has expired or was already used. Ask for a new one below.</FormAlert>
        </div>
      )}

      <div className="mt-8">
        <ForgotForm />
      </div>

      <p className="mt-8 border-t border-border pt-6 text-center text-[14px] text-muted">
        Remembered it?{" "}
        <Link
          href="/login"
          className="text-foreground underline underline-offset-4 transition-colors duration-200 ease-out hover:text-muted"
        >
          Back to log in
        </Link>
      </p>
    </div>
  );
}
