import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import { cn } from "@/lib/utils";

/*
  Flat Design per D11: no gradients, no shadows, color or opacity shift on hover,
  150 to 200ms ease. Lime never carries white text, so the primary variant is
  always ink on lime. See docs/context/04-brand.md
*/
const button = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border font-medium transition-colors duration-200 ease-out disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "border-transparent bg-accent text-on-accent hover:bg-[var(--celpare-lime-dim)]",
        outline:
          "border-border bg-transparent text-foreground hover:bg-surface",
        ghost:
          "border-transparent bg-transparent text-muted hover:text-foreground",
      },
      size: {
        md: "h-11 px-[22px] text-[15px]",
        sm: "h-9 px-4 text-sm",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonVariants = VariantProps<typeof button>;

export function Button({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<"button"> & ButtonVariants) {
  return (
    <button className={cn(button({ variant, size }), className)} {...props} />
  );
}

export function ButtonLink({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof Link> & ButtonVariants) {
  return (
    <Link className={cn(button({ variant, size }), className)} {...props} />
  );
}

export { button as buttonVariants };
