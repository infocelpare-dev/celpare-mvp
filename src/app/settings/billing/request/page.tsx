import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { AccountNotices } from "@/components/app/account-notices";
import { AdminLink } from "@/components/app/admin-link";
import { BackLink } from "@/components/ui/back-link";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { BillingRequestForm } from "@/components/billing/request-form";
import {
  formatMoney,
  isPaidPlan,
  periodLabel,
  periodsFor,
  planLabel,
  type BillingKind,
  type BillingPeriod,
} from "@/lib/billing/catalog";
import { countries } from "@/lib/billing/countries";
import { isBillingOpen } from "@/lib/platform/settings";
import { DEVELOPER_PLANS, INDIVIDUAL_PLANS, yearlyCents } from "@/lib/pricing/plans";
import { SPONSORSHIP_PRICE_CENTS } from "@/lib/sponsored/config";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Pay for a plan",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

/*
  The paid plan request (phase BILL, D239). The price shown is the one /pricing
  shows (plans.ts); the price billed is read by the database from
  billing_prices, and a test keeps the two equal.
*/

function shownPrice(kind: BillingKind, plan: string, period: BillingPeriod): number | null {
  if (kind === "sponsorship") return SPONSORSHIP_PRICE_CENTS;
  const list = kind === "individual" ? INDIVIDUAL_PLANS : DEVELOPER_PLANS;
  const p = list.find((x) => x.id === plan);
  if (!p) return null;
  return period === "yearly" ? yearlyCents(p) : p.monthlyCents;
}

export default async function BillingRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; plan?: string; period?: string; tool?: string }>;
}) {
  if (!isSupabaseConfigured()) redirect("/pricing");
  const q = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/get-started");

  const kind = q.kind ?? "";
  const plan = q.plan ?? "";
  const period = (q.period === "yearly" ? "yearly" : "monthly") as BillingPeriod;
  const valid = isPaidPlan(kind, plan) && periodsFor(kind as BillingKind).includes(period);
  const open = await isBillingOpen();

  let toolName: string | null = null;
  let toolOk = true;
  if (valid && kind === "sponsorship") {
    toolOk = false;
    if (q.tool && /^[0-9a-f-]{36}$/i.test(q.tool)) {
      const { data } = await supabase
        .from("tools")
        .select("name")
        .eq("id", q.tool)
        .eq("developer_id", user.id)
        .eq("status", "approved")
        .maybeSingle();
      if (data) {
        toolName = data.name;
        toolOk = true;
      }
    }
  }

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  const cents = valid ? shownPrice(kind as BillingKind, plan, period) : null;

  return (
    <AppShell banner={<AccountNotices />} adminLink={<AdminLink />} signedIn>
      <Container className="max-w-[560px] py-10 sm:py-14">
        <BackLink href="/pricing" label="Back to pricing" className="mb-5" />
        <h1 className="text-[clamp(1.6rem,4vw,2.1rem)] font-medium leading-tight tracking-[-0.03em]">
          Pay for a plan
        </h1>

        {!valid || cents === null ? (
          <div className="mt-6">
            <p className="text-[15px] text-muted">That plan is not one we sell. Choose a plan on the pricing page.</p>
            <ButtonLink href="/pricing" className="mt-5">
              See plans
            </ButtonLink>
          </div>
        ) : !open ? (
          <div className="mt-6">
            <p className="text-[15px] leading-relaxed text-muted">
              Paid plans open soon. Until then everything on the Free plan stays free.
            </p>
            <ButtonLink href="/pricing" variant="outline" className="mt-5">
              Back to pricing
            </ButtonLink>
          </div>
        ) : !toolOk ? (
          <div className="mt-6">
            <p className="text-[15px] text-muted">Choose one of your approved tools to sponsor.</p>
            <ButtonLink href="/pricing/sponsored" className="mt-5">
              Choose a tool
            </ButtonLink>
          </div>
        ) : (
          <>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              Add your details for the receipt, then pay in BTC, ETH, BNB, XRP or USDT on the NOWPayments page. Your plan switches on by
              itself as soon as the payment confirms on the blockchain, usually within minutes.
            </p>

            <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-2xl border border-border p-5 text-[15px]">
              <dt className="text-muted">Plan</dt>
              <dd className="font-medium">{planLabel(kind as BillingKind, plan)}</dd>
              {toolName ? (
                <>
                  <dt className="text-muted">Tool</dt>
                  <dd>{toolName}</dd>
                </>
              ) : null}
              <dt className="text-muted">Billing</dt>
              <dd>{periodLabel(period)}</dd>
              <dt className="text-muted">Amount</dt>
              <dd className="font-medium">
                {formatMoney(cents)}
                <span className="font-normal text-muted"> {period === "yearly" ? "a year" : "a month"}</span>
              </dd>
            </dl>

            <div className="mt-8">
              <BillingRequestForm
                kind={kind}
                plan={plan}
                period={period}
                toolId={kind === "sponsorship" ? q.tool : undefined}
                defaultName={profile?.full_name ?? ""}
                defaultEmail={user.email ?? ""}
                countries={countries()}
              />
            </div>

            <p className="mt-6 text-[13px] text-muted">
              Questions about billing? Write to{" "}
              <Link href="mailto:billing@celpare.com" className="underline underline-offset-2">
                billing@celpare.com
              </Link>
              .
            </p>
          </>
        )}
      </Container>
    </AppShell>
  );
}
