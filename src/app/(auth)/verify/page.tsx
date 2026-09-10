import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { VerifyForm } from "@/components/auth/verify-form";

export const metadata: Metadata = {
  title: "Confirm your email",
  robots: { index: false, follow: false },
};

export default async function VerifyPage({ searchParams }: PageProps<"/verify">) {
  const params = await searchParams;
  const email = typeof params?.email === "string" ? params.email : "";

  // Nothing to verify without an address, so send them back to sign up
  // rather than showing an input that cannot work.
  if (!email) redirect("/signup");

  return (
    <div>
      <h1 className="font-display text-[28px] font-bold leading-tight">
        Confirm your email
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">
        We sent a 6 digit code to{" "}
        <span className="font-medium text-foreground">{email}</span>. Enter it
        below to finish creating your account.
      </p>

      <div className="mt-8">
        <VerifyForm email={email} />
      </div>

      <p className="mt-8 border-t border-border pt-6 text-center text-[14px] text-muted">
        Wrong address?{" "}
        <Link
          href="/signup"
          className="text-foreground underline underline-offset-4 transition-colors duration-200 ease-out hover:text-muted"
        >
          Start again
        </Link>
      </p>
    </div>
  );
}
