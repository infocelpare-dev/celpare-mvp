"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

/*
  The theme, as a SETTING rather than a toggle. Founder instruction 2026-09-19:
  it came out of the top bar of every page and belongs with the other
  preferences.

  A toggle and a setting are not the same control, and the difference is the
  third option. A toggle can only flip between light and dark, so choosing it
  silently ends "follow my device", and somebody whose phone switches at dusk
  loses that without being told. Three explicit choices say what is actually
  stored, and System is the default next-themes already ships with.

  WHY THE SELECTED STATE IS NOT DRIVEN BY CSS HERE, unlike ThemeToggle. That
  component had to paint the right icon on the first frame, so it used the same
  media query the palette uses. This one has to show which of three values is
  STORED, and "system" is not expressible as a media query: at night, System
  and Dark look identical and mean different things.

  WHY useSyncExternalStore, AND WHAT IT FIXES. `theme` is undefined on the
  server and known on the client, so the first attempt rendered
  aria-checked="false" on the server and reached for suppressHydrationWarning
  to quieten the mismatch. That was wrong, and it shipped a real defect:

    React does not PATCH mismatched attributes during hydration. It warns and
    keeps the server's DOM.

  Suppressing the warning therefore froze aria-checked at "false" on all three
  buttons, permanently, so the settings page showed no selection at all while
  the theme was plainly set. It looked fine, typechecked, linted, and was found
  only by reading the attribute back in a browser.

  The fix is to make the server and the first client render AGREE, and then
  re-render. `mounted` is false in both, so hydration matches exactly; React
  then re-renders because the client snapshot differs from the server one,
  which is what this hook is for. It is also the lint clean way to do it: the
  usual `mounted` flag needs a setState inside an effect, which is what
  react-hooks/set-state-in-effect flags and what ThemeToggle avoided.
*/

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

/* Nothing to subscribe to: this changes once, at hydration, and never again. */
const noop = () => () => {};

export function ThemeChoice() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

  return (
    <div role="radiogroup" aria-label="Theme" className="flex flex-wrap gap-2">
      {OPTIONS.map((option) => {
        /* Before hydration nothing is marked, which lasts one frame and is the
           honest answer: the stored choice lives in localStorage and the
           server genuinely does not know it. */
        const selected = mounted && theme === option.value;
        const Icon = option.icon;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(option.value)}
            className={cn(
              /* 44px tall, which is the touch target the ux guidance asks for,
                 with at least 8px between them for the spacing rule. */
              "inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border px-4 text-[14px]",
              "transition-colors duration-200 ease-out",
              selected
                ? /* Ink and weight, never lime text: #d1fe03 on paper is
                     1.17:1 and globals.css bars it outright (D2). The mark is
                     the border and the weight, so it does not depend on colour
                     alone, which the accessibility guidance also wants. */
                  "border-foreground bg-surface font-medium text-foreground"
                : "border-border text-muted hover:border-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
