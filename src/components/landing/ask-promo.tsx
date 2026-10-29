"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Pause, Play } from "lucide-react";

/*
  The Ask Celpare promo (2026-10-04), replacing the code drawn recording of 4AY.
  The film is made in code with Remotion (`video/`, `npm run video:render`), so
  the same file the landing page plays is the one posted to TikTok and Instagram,
  whose vertical cut lives beside it in public/video.

  HONEST BY CONSTRUCTION (D13, D30): the tools in it are real catalogue rows, as
  the caption says, and it shows no counts, ratings or users.

  It follows the site's theme (a light and a dark render), plays only while on
  screen in a visible tab, has a Pause button (WCAG 2.2.2), and under reduced
  motion shows the poster, the finished answer, and never autoplays. It has no
  sound, so it needs no captions; the sentence in the DOM says what it shows.
*/

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

export function AskPromo() {
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const { resolvedTheme } = useTheme();
  const reduced = usePrefersReducedMotion();
  const [paused, setPaused] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), {
      threshold: 0.25,
    });
    io.observe(el);
    const vis = () => setTabVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", vis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", vis);
    };
  }, []);

  const playing = !reduced && !paused && onScreen && tabVisible;
  /* Unknown until next-themes has mounted; the box keeps its size meanwhile. */
  const theme = resolvedTheme === "dark" ? "dark" : resolvedTheme === "light" ? "light" : null;

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (playing) v.play().catch(() => {});
    else v.pause();
  }, [playing, theme]);

  return (
    <figure className="mx-auto w-full">
      <p className="sr-only">
        A short film about Ask Celpare. Too many AI tools, one question: someone asks for
        the three best AI tools for video generation, and Ask Celpare answers with Runway,
        Kling and Sora from the Celpare catalogue. Compare, choose, use. Celpare, right
        tool, right result.
      </p>

      <div
        ref={box}
        className="relative aspect-video overflow-hidden rounded-[28px] border border-border bg-background"
      >
        {theme ? (
          reduced ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/video/ask-celpare-poster-${theme}.jpg`}
              alt=""
              aria-hidden
              className="size-full object-cover"
            />
          ) : (
            <video
              key={theme}
              ref={video}
              aria-hidden
              muted
              loop
              playsInline
              preload="metadata"
              poster={`/video/ask-celpare-poster-${theme}.jpg`}
              className="size-full object-cover"
            >
              <source src={`/video/ask-celpare-${theme}.mp4`} type="video/mp4" />
            </video>
          )
        ) : null}

        {reduced ? null : (
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? "Play the Ask Celpare film" : "Pause the Ask Celpare film"}
            className="absolute end-3 top-3 flex size-8 cursor-pointer items-center justify-center rounded-full border border-border bg-elevated text-muted transition-colors duration-200 hover:text-foreground"
          >
            {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
          </button>
        )}
      </div>

      <figcaption className="mt-3 text-center text-[12px] text-muted">
        A preview of Ask Celpare. The tools shown are real entries from the Celpare catalogue.
      </figcaption>
    </figure>
  );
}
