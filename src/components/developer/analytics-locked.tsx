import { BarChart3, Lock } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { arePaidPlansOn } from "@/lib/platform/settings";

/*
  What a Free developer sees where analytics would be. Analytics are on the
  Pro and Elite developer plans (founder, 2026-10-09), and an active
  sponsorship gives Elite (D271). While the plans are paused it points at the
  sponsorship only. No sample numbers: a fake chart would be an invented
  metric (D13).
*/
export async function AnalyticsLocked({ compact = false }: { compact?: boolean }) {
  const plansOn = await arePaidPlansOn();
  return (
    <div className="rounded-2xl border border-border p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border text-muted">
          {compact ? <Lock className="size-4" aria-hidden /> : <BarChart3 className="size-4" aria-hidden />}
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-[17px] font-medium">{plansOn ? "Analytics is on the Pro and Elite plans, or with a sponsorship" : "Analytics comes with a sponsorship"}</h2>
          <p className="mt-1.5 max-w-[60ch] text-[14px] leading-relaxed text-muted">
            See how people find your tools: views over time, where they came from, the searches that led
            them to you, and which tool they opened, for 24 hours, 7 days or 30 days.
          </p>
          {compact ? null : (
            <p className="mt-2 text-[13px] text-muted">
              {plansOn ? "Get a developer plan or sponsor one of your tools to open it." : "Sponsor any of your tools to open it."} Your listings keep collecting views in the meantime.
            </p>
          )}
          <div className="mt-4">
            <ButtonLink href={plansOn ? "/pricing?for=developers" : "/pricing"} size="sm" variant={compact ? "outline" : "primary"}>
              {plansOn ? "See developer plans" : "See sponsorship"}
            </ButtonLink>
          </div>
        </div>
      </div>
    </div>
  );
}
