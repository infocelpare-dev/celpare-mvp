import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { Delta } from "@/lib/analytics/series";
import { cn } from "@/lib/utils";

/*
  A headline number with its change, the top row of every analytics board.

  The change is an arrow AND words AND a tint, never colour alone, and the
  screen reader hears the full sentence. Up is good by default; a measure where
  rising is bad (reports, failures) passes goodWhen="down" so the tint follows
  meaning rather than direction.

  No tabular-nums on the big figure: equal width digits make a standalone
  number look loose. Plain Inter at weight 500, like the headings (D122).
*/
export function DeltaChip({
  delta,
  goodWhen = "up",
  against,
  className,
}: {
  delta: Delta;
  goodWhen?: "up" | "down";
  /* "the previous 7 days", for the spoken version. */
  against?: string;
  className?: string;
}) {
  const good = delta.dir !== "flat" && delta.dir === goodWhen;
  const bad = delta.dir !== "flat" && delta.dir !== goodWhen;
  const Icon = delta.dir === "up" ? ArrowUpRight : delta.dir === "down" ? ArrowDownRight : Minus;
  const spoken =
    delta.change === null || delta.dir === "flat"
      ? delta.text
      : `${delta.dir === "up" ? "Up" : "Down"} ${delta.text}${against ? ` on ${against}` : ""}`;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[12px] font-medium",
        good && "bg-ok-surface text-ok-text",
        bad && "bg-danger-surface text-danger-text",
        !good && !bad && "bg-surface text-muted",
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      <span aria-hidden>{delta.text}</span>
      <span className="sr-only">{spoken}</span>
    </span>
  );
}

export function KpiBody({
  label,
  value,
  delta,
  goodWhen,
  against,
  caption,
  stacked = false,
}: {
  /* The chip on its own line, for narrow tabs that sit in one row. */
  stacked?: boolean;
  label: string;
  value: string;
  delta?: Delta;
  goodWhen?: "up" | "down";
  against?: string;
  caption?: string;
}) {
  return (
    <>
      <span className="block truncate text-[13px] text-muted">{label}</span>
      <span className={cn("mt-1 flex flex-wrap gap-x-2 gap-y-1.5", stacked ? "flex-col items-start" : "items-center")}>
        <span className="text-[26px] font-medium leading-tight tracking-[-0.02em] text-foreground">
          {value}
        </span>
        {delta ? <DeltaChip delta={delta} goodWhen={goodWhen} against={against} /> : null}
      </span>
      {caption ? <span className="mt-1 block text-[12px] leading-snug text-muted">{caption}</span> : null}
    </>
  );
}

/* A static KPI, for a measure with no series behind it. */
export function KpiCard(props: React.ComponentProps<typeof KpiBody> & { className?: string }) {
  const { className, ...rest } = props;
  return (
    <div className={cn("rounded-2xl border border-border bg-elevated p-4", className)}>
      <KpiBody {...rest} />
    </div>
  );
}

export function KpiGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", className)}>{children}</div>;
}
