import { cn } from "@/lib/utils";

/*
  The bottom of a list, said out loud.

  WHY THIS EXISTS. A list that just stops leaves somebody scrolling into blank
  space wondering whether more is loading, whether something broke, or whether
  they have actually seen everything. The ux guidance rates a dead end with no
  explanation a real defect, and the fix is cheap: say which of those three it
  is and offer the next thing to do.

  IT NEVER CLAIMS MORE THAN IT KNOWS. "You have reached the end" is a statement
  about the whole feed, and making it when the query was capped at one page
  would be false. The callers decide which sentence is true and this component
  only draws it, which is why the copy is a prop rather than a constant in here.

  Centred, because it is a terminus rather than content: everything above it is
  left aligned and reading order stops here on purpose.
*/
export function EndOfList({
  icon,
  title,
  body,
  children,
  className,
}: {
  /* Decorative. The heading carries the meaning, so this is aria-hidden by the
     caller and never the only signal. */
  icon?: React.ReactNode;
  title: string;
  body: string;
  /* The way onward. One or two controls, never a menu. */
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-t border-border px-4 py-10 text-center sm:px-5 sm:py-12",
        className,
      )}
    >
      {icon ? (
        <span className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full border border-border text-muted">
          {icon}
        </span>
      ) : null}

      <p className="font-display text-[16px] font-semibold">{title}</p>

      <p className="mx-auto mt-2 max-w-[46ch] text-[14px] leading-relaxed text-muted">
        {body}
      </p>

      {children ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          {children}
        </div>
      ) : null}
    </div>
  );
}
