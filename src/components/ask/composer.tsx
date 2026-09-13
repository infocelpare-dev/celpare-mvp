"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  ChevronUp,
  Globe,
  Lock,
  Search,
  SlidersHorizontal,
  Square,
  Telescope,
} from "lucide-react";
import { cn } from "@/lib/utils";

/*
  The composer.

  One rounded surface holding the message, the modes and the send control,
  rather than an input with a button beside it. The founder's reference put the
  controls inside the box and under the text, which is the arrangement that
  scales: a fourth source is another row in one menu rather than another chip
  competing with the send button.

  Celpare's own system, not the reference's palette (D31). Flat, one hairline
  border, no shadow (D11), and an active chip is ink on lime, never white on
  lime (D2).

  There is no microphone. Voice input is not built, and a control that does
  nothing is worse than an absent one.

  Locked sources stay listed rather than hidden. Someone on the free plan should
  be able to see that deep research exists and what it would take to get it,
  which is also why the lock explains itself in words in the menu rather than in
  a tooltip, where a touch screen never sees it.

  The field carries no focus ring of its own. The global rule paints a lime
  outline on anything focused, and on a box this size that reads as a green halo
  around the thing you are typing in. Focus is still shown, and shown better:
  the whole composer border lifts to the foreground colour. The ring stays on
  every other control, where it is the only signal a keyboard user gets.
*/

export type ModeKey = "toolSearch" | "webSearch" | "deepResearch";

export type ModeGrant = { allowed: boolean; requires: string | null };

export type Modes = Record<ModeKey, boolean>;
export type Grants = Record<ModeKey, ModeGrant>;

const PLAN_LABEL: Record<string, string> = {
  anon: "an account",
  free: "the Free plan",
  pro: "Pro",
  premium: "Premium",
};

const MODES: {
  key: ModeKey;
  label: string;
  icon: typeof Search;
  hint: string;
}[] = [
  {
    key: "toolSearch",
    label: "Tool search",
    icon: Search,
    hint: "Search the Celpare catalogue for matching tools",
  },
  {
    key: "webSearch",
    label: "Web search",
    icon: Globe,
    hint: "Check the web when the answer depends on something recent",
  },
  {
    key: "deepResearch",
    label: "Deep research",
    icon: Telescope,
    hint: "Search several angles, then answer from everything found. Slower.",
  },
];

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  busy,
  modes,
  grants,
  onToggle,
  signedIn,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  busy: boolean;
  modes: Modes;
  grants: Grants;
  onToggle: (key: ModeKey, next: boolean) => void;
  signedIn: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [locked, setLocked] = useState<string | null>(null);
  /* Focus is tracked in state rather than left to focus-within, because the
     indicator is the only one the field has now that the ring is gone, and it
     has to be certain rather than a cascade that might lose. */
  const [focused, setFocused] = useState(false);

  // Grow with the content, up to a point, then scroll.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  /* Close on a click outside or on Escape, which is what every menu is expected
     to do and the thing people notice only when it is missing. */
  useEffect(() => {
    if (!menuOpen) return;

    const onPointer = (e: MouseEvent | TouchEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  /* What the one button says. Naming the single active mode is more useful than
     a count, and a count is more useful than a list once there are two. */
  const active = MODES.filter((m) => grants[m.key].allowed && modes[m.key]);
  const activeCount = active.length;
  const summary =
    activeCount === 0
      ? "Sources off"
      : activeCount === 1
        ? active[0].label
        : `${activeCount} sources on`;

  const lockedMessage = (mode: (typeof MODES)[number], grant: ModeGrant) => {
    const requires = grant.requires;
    if (!requires) return `${mode.label} is not available right now.`;
    if (requires === "anon") return `${mode.label} is not available right now.`;
    if (requires === "free" && !signedIn) {
      return `${mode.label} needs an account. Creating one is free.`;
    }
    return `${mode.label} is on ${PLAN_LABEL[requires] ?? requires}.`;
  };

  return (
    <div>
      <div
        className={cn(
          "rounded-[20px] border bg-surface px-3 pb-2 pt-3 transition-colors duration-200",
          focused ? "border-foreground" : "border-border",
        )}
      >
        <label htmlFor="ask-input" className="sr-only">
          Ask about AI tools, models, tech or SaaS
        </label>
        <textarea
          id="ask-input"
          ref={ref}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            // Enter sends, shift and enter makes a new line.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder="What are you trying to do?"
          /* focus-ring-none is defined in globals.css, where it can beat the
             global ring rule. The container border is the focus indicator
             instead. */
          className="focus-ring-none max-h-[200px] min-h-[28px] w-full resize-none bg-transparent px-1 text-[15px] leading-relaxed placeholder:text-muted"
        />

        <div className="mt-2 flex items-end gap-2">
          {/*
            One control rather than three chips, on founder instruction.

            Three chips put the machinery on the same visual level as the thing
            being written. One button states what is on, and the detail is one
            tap away for the people who want it, which is the minority on any
            given message.
          */}
          <div className="relative min-w-0 flex-1" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-haspopup="true"
              className={cn(
                "inline-flex h-8 max-w-full cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors duration-200",
                activeCount > 0
                  ? "border-transparent bg-accent text-on-accent"
                  : "border-border text-muted hover:bg-background hover:text-foreground",
              )}
            >
              <SlidersHorizontal className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{summary}</span>
              <ChevronUp
                className={cn(
                  "size-3.5 shrink-0 transition-transform duration-200",
                  menuOpen && "rotate-180",
                )}
                aria-hidden
              />
            </button>

            {menuOpen ? (
              <div
                role="group"
                aria-label="What Celpare may use for this answer"
                /* Above the button, because the composer sits at the bottom of
                   the screen and a menu dropping down would leave the page. */
                className="absolute bottom-[calc(100%+8px)] left-0 z-20 w-[min(320px,calc(100vw-48px))] overflow-hidden rounded-2xl border border-border bg-background"
              >
                {MODES.map((mode) => {
                  const grant = grants[mode.key];
                  const on = grant.allowed && modes[mode.key];
                  const Icon = grant.allowed ? mode.icon : Lock;

                  return (
                    <button
                      key={mode.key}
                      type="button"
                      aria-pressed={grant.allowed ? on : undefined}
                      aria-disabled={!grant.allowed}
                      onClick={() => {
                        if (!grant.allowed) {
                          setLocked(lockedMessage(mode, grant));
                          setMenuOpen(false);
                          return;
                        }
                        setLocked(null);
                        onToggle(mode.key, !on);
                      }}
                      className={cn(
                        "flex w-full cursor-pointer items-start gap-3 border-b border-border px-3 py-2.5 text-left transition-colors duration-200 last:border-b-0",
                        grant.allowed ? "hover:bg-surface" : "cursor-not-allowed opacity-60",
                      )}
                    >
                      <Icon
                        className={cn(
                          "mt-0.5 size-4 shrink-0",
                          on ? "text-accent" : "text-muted",
                        )}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-[14px] font-medium">{mode.label}</span>
                          {on ? (
                            <Check className="size-4 shrink-0 text-accent" aria-hidden />
                          ) : null}
                        </span>
                        <span className="mt-0.5 block text-[12px] leading-relaxed text-muted">
                          {grant.allowed ? mode.hint : lockedMessage(mode, grant)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          {busy ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop"
              className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-background text-foreground transition-colors duration-200 hover:bg-surface"
            >
              <Square className="size-3.5" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              onClick={onSend}
              disabled={!value.trim()}
              aria-label="Send"
              className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-transparent bg-accent text-on-accent transition-colors duration-200 hover:bg-[var(--celpare-lime-dim)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowUp className="size-4" aria-hidden />
            </button>
          )}
        </div>
      </div>

      {/* Announced, because the chip that triggered it is now showing a lock
          and nothing else changed on screen. */}
      {locked ? (
        <p className="mt-2 px-1 text-[13px] text-muted" role="status">
          {locked}
        </p>
      ) : null}
    </div>
  );
}
