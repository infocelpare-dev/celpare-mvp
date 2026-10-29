"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button, ButtonLink } from "@/components/ui/button";
import type { SponsorChoice } from "@/lib/sponsored/choice";

/*
  Choose which of your tools to sponsor (founder, 2026-10-09). Native radios,
  so arrow keys, focus and screen readers work without extra code. A tool that
  cannot be sponsored stays in the list, dimmed and disabled, with the reason
  in words, so a developer knows what to fix rather than wondering where it went.

  Buying is not open yet: the button stays Coming soon (D204), and the choice
  is shown in the line above it so the offer reads as "this tool, this price".
*/
export function SponsorToolPicker({
  choices,
  initial,
  price,
  endsFormatted,
}: {
  choices: SponsorChoice[];
  initial: string | null;
  price: string;
  /* slug to "1 November 2026", formatted on the server (rule: pin the timezone). */
  endsFormatted: Record<string, string>;
}) {
  const [selected, setSelected] = useState<string | null>(initial);
  const chosen = choices.find((c) => c.slug === selected) ?? null;

  if (choices.length === 0) {
    return (
      <div className="rounded-2xl border border-border p-4">
        <p className="text-[15px] font-medium">You have no tools yet</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          Submit a tool and get it approved, then choose it here.
        </p>
        <ButtonLink href="/developer/submit" size="sm" variant="outline" className="mt-3">
          Submit a tool
        </ButtonLink>
      </div>
    );
  }

  return (
    <div>
      <fieldset>
        <legend className="mb-2 text-[14px] font-medium">Choose a tool to sponsor</legend>
        <div className="grid gap-2">
          {choices.map((c) => {
            const on = c.slug === selected;
            const until = c.sponsoredUntil ? endsFormatted[c.slug] : null;
            return (
              <label
                key={c.slug}
                className={cn(
                  "flex items-start gap-3 rounded-2xl border px-3.5 py-3 transition-colors duration-200",
                  c.eligible ? "cursor-pointer hover:bg-surface" : "cursor-not-allowed opacity-60",
                  on ? "border-foreground" : "border-border",
                )}
              >
                <input
                  type="radio"
                  name="sponsor-tool"
                  value={c.slug}
                  checked={on}
                  disabled={!c.eligible}
                  onChange={() => setSelected(c.slug)}
                  className="mt-2.5 size-4 shrink-0 accent-[var(--color-foreground)]"
                />
                {c.logoUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={c.logoUrl} alt="" className="size-9 shrink-0 rounded-lg border border-border object-contain" />
                ) : (
                  <span
                    aria-hidden
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-[15px] font-medium text-muted"
                  >
                    {c.name.trim().charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{c.name}</span>
                  <span className="mt-0.5 block text-[12px] leading-relaxed text-muted">
                    {c.eligible
                      ? "Ready to sponsor"
                      : until
                        ? `Sponsored until ${until}`
                        : c.reason}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <p className="mt-4 text-[14px] text-muted" aria-live="polite">
        {chosen ? (
          <>
            Sponsoring <span className="font-medium text-foreground">{chosen.name}</span> for {price} a month.
          </>
        ) : (
          "None of your tools can be sponsored yet. The reason is under each one."
        )}
      </p>

      <div className="mt-3">
        <Button className="w-full" disabled aria-describedby="sponsored-note">
          Coming soon
          <span className="sr-only">: sponsorship cannot be bought yet</span>
        </Button>
      </div>
    </div>
  );
}
