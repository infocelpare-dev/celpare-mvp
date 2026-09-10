"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

/*
  Which icon shows is decided in CSS, not in React state. The usual
  `mounted` flag needs a setState inside an effect, which causes a cascading
  render and is flagged by react-hooks/set-state-in-effect. Driving it from
  the same media query and data-theme selectors that drive the palette means
  the correct icon is painted on the first frame, with no hydration mismatch
  and no flash. See the theme-icon rules in globals.css.

  resolvedTheme is only read inside the click handler, which never runs
  during render, so nothing here depends on it at paint time.
*/
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label="Toggle light and dark theme"
      className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg border border-border text-muted transition-colors duration-200 ease-out hover:text-foreground"
    >
      <Moon className="theme-icon-light h-4 w-4" aria-hidden />
      <Sun className="theme-icon-dark h-4 w-4" aria-hidden />
    </button>
  );
}
