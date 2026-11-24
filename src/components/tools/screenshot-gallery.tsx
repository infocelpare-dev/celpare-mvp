"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

/*
  Screenshots on a tool profile, one at a time (founder, 2026-11-22: "why
  screenshots on tool page cant look one by one"). They were plain images in a
  grid, so a phone showed each one too small to read and tapping did nothing.

  Tap one and it opens large in a native <dialog>, for the reasons
  save-to-collection.tsx gives: showModal() supplies the focus trap, Escape,
  the inert page behind it and the top layer. Then Previous and Next, the arrow
  keys, or a sideways swipe on the picture move through them. The swipe lives
  inside the dialog only, never on the page itself.
*/

export type Screenshot = { id: string; url: string; caption: string | null };

/* A sideways drag this long, in CSS pixels, counts as a swipe. */
const SWIPE_PX = 50;

export function ScreenshotGallery({ items }: { items: Screenshot[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState<number | null>(null);
  const startX = useRef<number | null>(null);

  const count = items.length;
  const open = index !== null;
  const current = open ? items[index] : undefined;

  const go = useCallback(
    (step: number) => setIndex((i) => (i === null ? i : (i + step + count) % count)),
    [count],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    /* A modal dialog makes the page inert but still lets it scroll under a
       finger or wheel, so the page is held still while the viewer is open. */
    if (!open) return;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = before;
    };
  }, [open]);

  /* Fetch the neighbours while this one is on screen, so Next and Previous
     show a picture at once instead of waiting on the network. */
  useEffect(() => {
    if (index === null || count < 2) return;
    for (const step of [1, -1]) {
      const img = new Image();
      img.src = items[(index + step + count) % count].url;
    }
  }, [index, count, items]);

  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => setIndex(i)}
              className="block w-full cursor-zoom-in overflow-hidden rounded-xl border border-border transition-opacity duration-200 ease-out hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.url}
                alt={s.caption ?? ""}
                loading="lazy"
                className="w-full object-cover"
              />
              <span className="sr-only">
                Open screenshot {i + 1} of {count}
              </span>
            </button>
            {s.caption ? (
              <p className="mt-1.5 text-[13px] text-muted">{s.caption}</p>
            ) : null}
          </li>
        ))}
      </ul>

      <dialog
        ref={dialogRef}
        aria-label="Screenshots"
        /* Escape and a backdrop dismissal both arrive here, so state cannot
           drift out of step with the element. */
        onClose={() => setIndex(null)}
        onClick={(e) => {
          if (e.target === dialogRef.current) setIndex(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") go(1);
          if (e.key === "ArrowLeft") go(-1);
        }}
        className="m-0 h-dvh max-h-none w-screen max-w-none bg-transparent p-0 text-white backdrop:bg-black/85"
      >
        {current ? (
          <div
            className="flex h-full flex-col items-center justify-center gap-3 px-4 py-14"
            onClick={(e) => {
              if (e.target === e.currentTarget) setIndex(null);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={current.id}
              src={current.url}
              alt={current.caption ?? `Screenshot ${index! + 1} of ${count}`}
              draggable={false}
              onPointerDown={(e) => {
                startX.current = e.clientX;
                /* Keep receiving the pointer when a swipe ends off the picture.
                   It throws when the pointer is already gone; the swipe then
                   still works if it ends on the picture. */
                try {
                  e.currentTarget.setPointerCapture(e.pointerId);
                } catch {}
              }}
              onPointerCancel={() => {
                startX.current = null;
              }}
              onPointerUp={(e) => {
                if (startX.current === null) return;
                const dx = e.clientX - startX.current;
                startX.current = null;
                if (count > 1 && Math.abs(dx) >= SWIPE_PX) go(dx < 0 ? 1 : -1);
              }}
              className="max-h-[78dvh] max-w-full touch-pan-y select-none rounded-lg object-contain"
            />
            <p className="max-w-[640px] text-center text-[14px] text-white/80" aria-live="polite">
              {count > 1 ? `${index! + 1} of ${count}` : null}
              {count > 1 && current.caption ? ". " : null}
              {current.caption}
            </p>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setIndex(null)}
          className={cn(ctrl, "absolute end-3 top-3")}
        >
          <X className="size-5" aria-hidden />
          <span className="sr-only">Close</span>
        </button>

        {count > 1 ? (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              className={cn(ctrl, "absolute start-3 top-1/2 -translate-y-1/2")}
            >
              <ChevronLeft className="size-6" aria-hidden />
              <span className="sr-only">Previous screenshot</span>
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              className={cn(ctrl, "absolute end-3 top-1/2 -translate-y-1/2")}
            >
              <ChevronRight className="size-6" aria-hidden />
              <span className="sr-only">Next screenshot</span>
            </button>
          </>
        ) : null}
      </dialog>
    </>
  );
}

/* 44px round controls, white on the dark backdrop, with a visible focus ring. */
const ctrl =
  "inline-flex size-11 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white transition-colors duration-200 ease-out hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
