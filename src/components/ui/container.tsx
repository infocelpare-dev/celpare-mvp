import { cn } from "@/lib/utils";

/* 1140px max width from the Notion landing spec. 16px minimum side gutter. */
export function Container({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("mx-auto w-full max-w-[1140px] px-4 sm:px-6", className)}
      {...props}
    />
  );
}

export function Section({
  className,
  ...props
}: React.ComponentProps<"section">) {
  return (
    <section className={cn("py-16 sm:py-[88px]", className)} {...props} />
  );
}

export function SectionHead({
  title,
  subtitle,
  className,
}: {
  title: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <div className={cn("mb-12 text-center", className)}>
      <h2 className="font-display text-[clamp(1.6rem,3vw,2.4rem)] font-semibold leading-tight">
        {title}
      </h2>
      {subtitle ? (
        <p className="mx-auto mt-3 max-w-[560px] text-muted">{subtitle}</p>
      ) : null}
    </div>
  );
}
