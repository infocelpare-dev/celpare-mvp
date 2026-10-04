import Link from "next/link";
import { cn } from "@/lib/utils";

/*
  A pill segmented switch made of links, the way claude.com/pricing switches
  between audiences and billing. Links, not buttons: the choice lives in the
  URL (?for=, ?billing=), so it survives a reload, can be shared, and the page
  stays server rendered with no client state.
*/
export function SegmentedLinks({
  label,
  items,
}: {
  label: string;
  items: { href: string; label: string; active: boolean; badge?: string }[];
}) {
  return (
    <nav
      aria-label={label}
      className="inline-flex rounded-full border border-border bg-surface p-1"
    >
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          scroll={false}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "inline-flex min-h-11 items-center rounded-full px-5 text-[15px] font-medium tracking-[-0.01em] transition-colors duration-200 ease-out sm:min-h-10",
            item.active
              ? "bg-elevated text-foreground shadow-[0_0_0_1px_var(--border)]"
              : "text-muted hover:text-foreground",
          )}
        >
          {item.label}
          {item.badge ? (
            <span className="ms-2 rounded-full bg-accent px-2 py-0.5 text-[12px] font-medium text-on-accent">
              {item.badge}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
