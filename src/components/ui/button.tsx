import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import { cn } from "@/lib/utils";

/*
  Pills, in the ElevenLabs manner (D122). Flat per D11: no gradients, no shadows,
  a colour shift on hover, 200ms ease.

  primary  near black on light, near white on dark. The one filled action.
  outline  a raised white pill with a hairline, the secondary action.
  ghost    text only.

  Lime left the primary button with D122 and stays an accent (dots, badges,
  switches, active states). It still never carries white text.
*/
const button = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border font-medium tracking-[-0.01em] transition-colors duration-200 ease-out disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "border-transparent bg-primary text-on-primary hover:bg-primary-hover",
        outline:
          "border-border bg-elevated text-foreground hover:bg-surface",
        ghost:
          "border-transparent bg-transparent text-muted hover:text-foreground",
      },
      size: {
        md: "h-11 px-6 text-[15px]",
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
