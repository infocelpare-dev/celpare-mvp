"use client";

import * as React from "react";
import {
  Switch as AriaSwitch,
  SwitchProps as AriaSwitchProps,
  composeRenderProps,
} from "react-aria-components";

import { cn } from "@/lib/utils";

/*
  A real switch, on react-aria-components.

  Adapted rather than pasted verbatim, for two reasons worth stating:

  1. The original targets shadcn's default palette and uses `bg-input`,
     `bg-primary` and `ring-offset-background`. None of those tokens exist in
     Celpare, whose palette is background, surface, foreground, muted, border,
     accent, on-accent and ring. Tailwind emits nothing for an undefined token,
     so pasting it unchanged renders a switch you cannot see. Mapped to the
     real tokens: the track is `surface` when off and `accent` when on.

  2. The original carries `shadow-lg` on the thumb. D11 is flat design, no
     gradients and no shadows, so the thumb is a hairline border instead. That
     also keeps it visible against the lime track, which a shadow would not.

  Everything react-aria actually provides is kept: the data-[selected],
  data-[focus-visible], data-[disabled] and data-[readonly] states, keyboard
  and pointer handling, and the correct switch role and labelling.
*/
const Switch = ({ children, className, ...props }: AriaSwitchProps) => (
  <AriaSwitch
    className={composeRenderProps(className, (className) =>
      cn(
        "group inline-flex cursor-pointer items-center gap-3 text-[15px] font-medium leading-none",
        "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60",
        className,
      ),
    )}
    {...props}
  >
    {composeRenderProps(children, (children) => (
      <>
        <div
          className={cn(
            "inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-border p-0.5 transition-colors duration-200 ease-out",
            /* Off, and on. Ink on lime is 14.52:1, which is why the thumb is
               ink coloured once the track is lime. */
            "bg-surface group-data-[selected]:border-transparent group-data-[selected]:bg-accent",
            /* Focus, using the project's own ring token. */
            "group-data-[focus-visible]:outline-none group-data-[focus-visible]:ring-2 group-data-[focus-visible]:ring-ring group-data-[focus-visible]:ring-offset-2 group-data-[focus-visible]:ring-offset-background",
            "group-data-[disabled]:cursor-not-allowed",
            "group-data-[readonly]:cursor-default",
            "focus-visible:outline-none",
          )}
        >
          <div
            className={cn(
              "pointer-events-none block size-[18px] rounded-full border border-border bg-background transition-transform duration-200 ease-out",
              "translate-x-0 group-data-[selected]:translate-x-5",
              "group-data-[selected]:border-transparent group-data-[selected]:bg-[var(--celpare-ink)]",
            )}
          />
        </div>
        {children}
      </>
    ))}
  </AriaSwitch>
);

export { Switch };
