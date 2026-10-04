"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Crown } from "lucide-react";

/*
  Upgrade, a crown in the top bar beside the bell (PRICE.3; crown chosen by
  the founder 2026-10-04, replacing a gem). Founder instruction
  2026-10-04: only an account on the Free plan sees it; anyone on a paid plan,
  and anyone signed out, does not.

  The plan is asked for once when the bar mounts. Until the answer arrives, or
  if it fails, nothing renders: showing Upgrade to someone who already pays is
  worse than showing it a moment late.

  Same 40px target and sr-only name as the other bar icons (BarIcon in
  app-shell.tsx). The lime dot marks it as the one action that is about the
  account rather than the page, and lime carries no text (D2).
*/
export function UpgradeIcon() {
  const [free, setFree] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/account/plan", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { plan: string | null } | null) => {
        if (live) setFree(body?.plan === "free");
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (!free) return null;

  return (
    <Link
      href="/pricing"
      title="Upgrade your plan"
      className="relative inline-flex size-10 items-center justify-center rounded-lg text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
    >
      <Crown className="size-[18px]" aria-hidden />
      <span
        className="absolute end-2 top-2 size-1.5 rounded-full bg-accent"
        aria-hidden
      />
      <span className="sr-only">Upgrade your plan</span>
    </Link>
  );
}
