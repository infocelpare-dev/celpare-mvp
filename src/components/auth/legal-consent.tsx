import Link from "next/link";

/*
  The consent line on sign up and log in (phase LEGAL, 2026-10-07). Continuing
  creates the account, and afterLogin records the Terms and Privacy version
  (TERMS_VERSION) against it. Under 18 needs a parent's or guardian's
  permission (founder decision, D206).
*/
export function LegalConsent({ creating }: { creating: "account" | "google" }) {
  const link = "text-foreground underline underline-offset-4 transition-colors duration-200 hover:text-muted";
  return (
    <p className="mt-5 text-center text-[12px] leading-relaxed text-muted">
      {creating === "account"
        ? "By creating an account you agree to the "
        : "If you are new, continuing with Google creates an account, and you agree to the "}
      <Link href="/legal/terms" className={link}>
        Terms of Service
      </Link>{" "}
      and confirm you have read the{" "}
      <Link href="/legal/privacy" className={link}>
        Privacy Policy
      </Link>
      . If you are under 18, you confirm a parent or guardian has agreed.
    </p>
  );
}
