import { BarChart3, Lock } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

/*
  What a Free developer sees where analytics would be (founder, 2026-10-09:
  analytics are for the Pro and Elite developer plans only). It says what the
  board holds and where the plans are, and it is honest that paid plans are not
  on sale yet. No sample numbers: a fake chart would be an invented metric (D13).
*/
export function AnalyticsLocked({ compact = false }: { compact?: boolean }) {
  return (
    <div className="rounded-2xl border border-border p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border text-muted">
          {compact ? <Lock className="size-4" aria-hidden /> : <BarChart3 className="size-4" aria-hidden />}
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-[17px] font-medium">Analytics is on the Pro and Elite plans</h2>
          <p className="mt-1.5 max-w-[60ch] text-[14px] leading-relaxed text-muted">
            See how people find your tools: views over time, where they came from, the searches that led
            them to you, and which tool they opened, for 24 hours, 7 days or 30 days.
          </p>
          {compact ? null : (
            <p className="mt-2 text-[13px] text-muted">
              Developer plans are coming soon. Your listings keep collecting views in the meantime.
            </p>
          )}
          <div className="mt-4">
            <ButtonLink href="/pricing?for=developers" size="sm" variant={compact ? "outline" : "primary"}>
              See developer plans
            </ButtonLink>
          </div>
        </div>
      </div>
    </div>
  );
}
