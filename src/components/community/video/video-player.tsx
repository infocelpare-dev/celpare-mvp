"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Loader2, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PostMedia } from "@/lib/community/queries";

/*
  One video in the vertical viewer.

  ONLY THE ACTIVE ONE IS A REAL PLAYER. A slide that is not active and not a
  neighbour renders no <video> element at all, so a list of thirty videos is not
  thirty media pipelines and thirty open connections. The neighbours exist with
  preload="metadata" so a swipe has a first frame ready, which is the difference
  between a swipe that plays and a swipe that shows black for a second.

  AUTOPLAY IS ATTEMPTED, NOT ASSUMED. Every browser blocks audible autoplay
  without a user gesture and there is no way to ask in advance, so the sequence
  is: try with sound, and on rejection mute and try again. That second attempt is
  what makes it work at all, and it is why the viewer starts muted in practice.
  The mute state is owned by the parent so it carries across swipes: somebody who
  unmutes once has said what they want, and asking again on every video would be
  the control that forgets.

  REDUCED MOTION IS HONOURED. prefers-reduced-motion means autoplay does not
  happen, and the person gets a play button instead. The ux guidance rates
  autoplaying media without a pause control a real barrier, and "it is a video
  feed" does not exempt it.

  TAP IS PLAY AND PAUSE, and it is a real button covering the frame rather than
  an onClick on a div, which the guidance rates Critical. The double tap to like
  is layered on top of it by the parent rather than in here, because a like
  belongs to the post and this component only knows about a file.
*/

export type PlaybackState = "idle" | "loading" | "playing" | "paused" | "error";

export function VideoPlayer({
  video,
  active,
  near,
  muted,
  onToggleMuted,
  onState,
  onProgress,
  onEnded,
  poster,
  captionsUrl,
  label,
}: {
  video: PostMedia;
  /* The one on screen. Exactly one slide in the list is active at a time, which
     is what guarantees only one video ever plays. */
  active: boolean;
  /* Within one of the active slide. Gets an element and metadata, nothing more. */
  near: boolean;
  muted: boolean;
  onToggleMuted: () => void;
  onState?: (state: PlaybackState) => void;
  /* Fired as playback advances, with whole seconds watched and the percentage,
     so the parent can record milestones without reading the element itself. */
  onProgress?: (info: { watchMs: number; percent: number; durationMs: number }) => void;
  onEnded?: () => void;
  poster?: string | null;
  captionsUrl?: string | null;
  label: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<PlaybackState>("idle");
  const reducedMotion = useReducedMotion();

  /* Whether the person has taken manual control of this slide. Once they pause
     deliberately, becoming active again must not start it back up underneath
     them, which is the difference between "resume where appropriate" and a
     control that fights its owner. */
  const manuallyPaused = useRef(false);

  const report = useCallback(
    (next: PlaybackState) => {
      setState(next);
      onState?.(next);
    },
    [onState],
  );

  /*
    Play when active, pause when not. The effect is the synchronisation point
    between React state and an imperative media element, which is exactly what an
    effect is for.
  */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (!active) {
      /* PAUSE, AND GIVE THE BUFFER BACK. Pausing alone leaves the browser
         holding the decoded frames of every video already visited, which on a
         phone is how a feed runs out of memory. Rewinding also means returning
         to a video starts it rather than resuming a fragment nobody remembers. */
      el.pause();
      el.currentTime = 0;
      manuallyPaused.current = false;
      /* No setState here. Pausing the element fires `pause`, and that handler is
         what moves the React state, so there is one path from the media element
         to the interface rather than two that can disagree. */
      return;
    }

    /* Reduced motion means no autoplay. The element stays paused and the play
       glyph is what the person gets, which is the ux guidance's requirement
       rather than a degraded version of it. */
    if (reducedMotion) return;
    if (manuallyPaused.current) return;

    let cancelled = false;

    async function start() {
      const node = ref.current;
      if (!node) return;
      try {
        node.muted = muted;
        await node.play();
      } catch {
        /* Audible autoplay was refused, which is the normal case on a first
           load. Mute and try once more; if that fails too the person gets the
           play button and nothing is broken. */
        if (cancelled) return;
        try {
          const retry = ref.current;
          if (!retry) return;
          retry.muted = true;
          await retry.play();
        } catch {
          if (!cancelled) report("paused");
        }
      }
    }

    void start();
    return () => {
      cancelled = true;
    };
    /* `muted` is deliberately absent: changing it must not restart playback.
       The separate effect below applies it to the live element instead. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, reducedMotion, report]);

  /* Mute is a property of the element, not a reason to reload or restart it. */
  useEffect(() => {
    const el = ref.current;
    if (el) el.muted = muted;
  }, [muted]);

  const onTimeUpdate = useCallback(() => {
    const el = ref.current;
    if (!el || !onProgress) return;
    const durationMs = Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : 0;
    if (durationMs <= 0) return;
    const watchMs = Math.round(el.currentTime * 1000);
    onProgress({
      watchMs,
      percent: Math.max(0, Math.min(100, Math.round((watchMs / durationMs) * 100))),
      durationMs,
    });
  }, [onProgress]);

  function togglePlay() {
    const el = ref.current;
    if (!el) return;
    if (el.paused) {
      manuallyPaused.current = false;
      void el.play().catch(() => report("error"));
    } else {
      manuallyPaused.current = true;
      el.pause();
    }
  }

  function retry() {
    const el = ref.current;
    if (!el) return;
    report("loading");
    /* load() re-runs resource selection, which is what a retry has to do: simply
       calling play() again on a failed element replays the same failure. */
    el.load();
    void el.play().catch(() => report("error"));
  }

  /* Far from the active slide: no element, no connection, no decode. A poster if
     the upload gave us one, otherwise the surface colour. */
  if (!active && !near) {
    return (
      <div
        className="size-full bg-surface"
        style={
          poster
            ? { backgroundImage: `url(${poster})`, backgroundSize: "cover", backgroundPosition: "center" }
            : undefined
        }
        aria-hidden
      />
    );
  }

  return (
    <div className="relative size-full">
      <video
        ref={ref}
        src={video.url}
        poster={poster ?? undefined}
        /* Active gets the file, a neighbour gets only enough for a first frame.
           This is the whole of "do not continuously download videos that are far
           away", and it is set per slide rather than globally. */
        preload={active ? "auto" : "metadata"}
        playsInline
        loop={false}
        muted={muted}
        onLoadStart={() => report("loading")}
        onWaiting={() => report("loading")}
        onPlaying={() => report("playing")}
        onPlay={() => report("playing")}
        onPause={() => {
          /* The pause that fires as a video ends is not a pause worth reporting,
             and reporting it would overwrite the ended state. */
          const el = ref.current;
          if (el && !el.ended) report("paused");
        }}
        onTimeUpdate={onTimeUpdate}
        onEnded={() => {
          report("paused");
          onEnded?.();
        }}
        onError={() => report("error")}
        className="size-full object-contain"
      >
        {/*
          Captions where the metadata gives us one. Nothing uploads a track yet,
          so this is almost always absent, and rendering an empty <track> would
          tell the browser a caption file exists at an empty URL.
        */}
        {captionsUrl ? (
          <track kind="captions" src={captionsUrl} srcLang="en" label="Captions" default />
        ) : null}
      </video>

      {/*
        THE TAP SURFACE IS A BUTTON. A click handler on a div is rated Critical by
        the guidance: no keyboard, no role, nothing announced. This is a real
        button covering the frame, so Space and Enter work and a screen reader is
        told what pressing it does.
      */}
      <button
        type="button"
        onClick={togglePlay}
        className="absolute inset-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
      >
        <span className="sr-only">
          {state === "playing" ? `Pause ${label}` : `Play ${label}`}
        </span>
      </button>

      {/* Buffering. Subtle and centred, never a sheet over the whole frame: the
          brief asks for an indicator that does not cover the video. */}
      {state === "loading" ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <Loader2 className="size-8 animate-spin text-white/90 drop-shadow" aria-hidden />
          <span className="sr-only" role="status">
            Loading video
          </span>
        </div>
      ) : null}

      {/* Paused gets a play glyph, so the state is visible and not only implied
          by the absence of motion. Pointer events off so the tap surface beneath
          still takes the press anywhere on the frame. */}
      {state === "paused" || state === "idle" ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="grid size-16 place-items-center rounded-full bg-black/45 backdrop-blur-sm">
            <Play className="size-7 translate-x-0.5 fill-white text-white" aria-hidden />
          </span>
        </div>
      ) : null}

      {/* Playback failed. A sentence and a way out, rather than a black square
          that looks like a video nobody made. */}
      {state === "error" ? (
        <div className="absolute inset-0 grid place-items-center bg-black/70 px-6 text-center">
          <div>
            <p className="text-[15px] font-medium text-white">Couldn&rsquo;t play this video.</p>
            <button
              type="button"
              onClick={retry}
              className="mt-3 inline-flex h-11 cursor-pointer items-center rounded-full border border-white/40 px-5 text-[14px] font-medium text-white transition-colors duration-200 ease-out hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Retry
            </button>
          </div>
        </div>
      ) : null}

      {/*
        Mute, and the explicit play/pause beside it.

        BOTH EXIST AS REAL BUTTONS ON PURPOSE. The brief asks that important
        actions not depend only on a gesture, and "tap the frame" is a gesture.
        Somebody using a keyboard, a switch or a screen reader gets named controls
        here, at 44px with a gap between them.
      */}
      <div className="absolute end-3 top-3 flex items-center gap-2">
        <button
          type="button"
          onClick={togglePlay}
          aria-pressed={state === "playing"}
          className="inline-flex size-11 cursor-pointer items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-colors duration-200 ease-out hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          {state === "playing" ? (
            <Pause className="size-5" aria-hidden />
          ) : (
            <Play className="size-5 translate-x-px" aria-hidden />
          )}
          <span className="sr-only">{state === "playing" ? "Pause" : "Play"}</span>
        </button>

        <button
          type="button"
          onClick={onToggleMuted}
          aria-pressed={!muted}
          className={cn(
            "inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-white backdrop-blur-sm",
            "bg-black/45 transition-colors duration-200 ease-out hover:bg-black/60",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
          )}
        >
          {muted ? <VolumeX className="size-5" aria-hidden /> : <Volume2 className="size-5" aria-hidden />}
          {/* The state is in the icon AND in the name, because an icon that
              changes shape is not announced on its own. */}
          <span className="sr-only">{muted ? "Unmute" : "Mute"}</span>
        </button>
      </div>
    </div>
  );
}

/*
  Whether the person asked for less motion.

  useSyncExternalStore rather than an effect that calls setState: a media query is
  an external store, this is the hook for reading one, and it gets the value on
  the first render instead of rendering once wrong and correcting. The server
  snapshot is false, because a server has no media queries and guessing would be
  a hydration mismatch.
*/
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia("(prefers-reduced-motion: reduce)");
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}
