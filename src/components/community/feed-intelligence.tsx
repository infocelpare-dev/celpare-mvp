"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { EyeOff } from "lucide-react";
import { setFeedFeedback } from "@/app/actions/feed";
import {
  addToSeenCookie,
  READ,
  SEEN,
  SEEN_COOKIE,
  SEEN_COOKIE_MAX_AGE_S,
  type SeenDepth,
} from "@/lib/community/intelligence/seen";
import { cn } from "@/lib/utils";

/*
  The feed's client half of Community Intelligence: what was shown, what was
  opened, how long it stayed on screen, and "not interested".

  NOTHING HERE RANKS ANYTHING. Ranking happens on the server and arrives as
  HTML; this only reports back, so the next ranking knows what this one did.
  The same shape as the video viewer's use-video-events: a queue, a timer, and a
  beacon on the way out. A failed send loses events and changes nothing on
  screen.
*/

const ENDPOINT = "/api/community/feed/events";
const FLUSH_MS = 10_000;
const MAX_BATCH = 60;
/* Half the card on screen for a second is an impression, not a scroll past. */
const VISIBLE_RATIO = 0.5;
const IMPRESSION_MS = 1000;
/* Dwell under this is not worth a row. */
const MIN_DWELL_MS = 1500;

type Event = {
  postId: string;
  event: "impression" | "open" | "dwell" | "serve";
  position: number;
  dwellMs?: number;
  reason?: string | null;
};

type Telemetry = {
  track: (e: Event) => void;
  /* The frozen ranking clock of this page, so Show more (which re-renders the
     earlier pages under the same clock) does not report them delivered twice. */
  servedKey: string | null;
};

/*
  feed_v3 dwell hygiene. Time on screen only counts while the window has focus
  and somebody touched the page (scroll, pointer, key) in the last
  READ.IDLE_MS, so a feed left open on a desk does not look like reading. One
  set of listeners for the page, read by every card.
*/
const activity = { lastInput: 0, blurredAt: null as number | null };

function activeUntil(): number {
  const idleEnd = activity.lastInput + READ.IDLE_MS;
  return activity.blurredAt === null ? idleEnd : Math.min(idleEnd, activity.blurredAt);
}

/* Once per page clock: was this post already reported delivered? */
function firstServe(servedKey: string, postId: string): boolean {
  try {
    const key = "celpare.feed.served";
    const raw = window.sessionStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as { k: string; ids: string[] }) : null;
    const state = parsed && parsed.k === servedKey ? parsed : { k: servedKey, ids: [] as string[] };
    if (state.ids.includes(postId)) return false;
    state.ids = [...state.ids, postId].slice(-200);
    window.sessionStorage.setItem(key, JSON.stringify(state));
    return true;
  } catch {
    return true;
  }
}

const TelemetryContext = createContext<Telemetry | null>(null);

function sessionId(): string | null {
  try {
    const key = "celpare.feed.session";
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    const made = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
    window.sessionStorage.setItem(key, made);
    return made;
  } catch {
    return null;
  }
}

export function FeedTelemetry({
  surface,
  algorithm,
  variant,
  servedKey = null,
  children,
}: {
  surface: "for_you" | "following" | "topic";
  algorithm: string | null;
  variant: string | null;
  servedKey?: string | null;
  children: ReactNode;
}) {
  const queue = useRef<Event[]>([]);

  useEffect(() => {
    activity.lastInput = performance.now();
    activity.blurredAt = document.hasFocus() ? null : performance.now();
    const onInput = () => {
      activity.lastInput = performance.now();
    };
    const onBlur = () => {
      activity.blurredAt = performance.now();
    };
    const onFocus = () => {
      activity.blurredAt = null;
      activity.lastInput = performance.now();
    };
    const opts = { passive: true, capture: true } as const;
    const inputs = ["scroll", "wheel", "pointerdown", "pointermove", "keydown", "touchstart"] as const;
    for (const e of inputs) window.addEventListener(e, onInput, opts);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      for (const e of inputs) window.removeEventListener(e, onInput, opts);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const flush = useCallback(
    (beacon: boolean) => {
      if (queue.current.length === 0) return;
      const events = queue.current.splice(0, MAX_BATCH);
      const body = JSON.stringify({ surface, algorithm, variant, sessionId: sessionId(), events });
      try {
        if (beacon && navigator.sendBeacon) {
          navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
          return;
        }
        void fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {});
      } catch {
        /* Telemetry never surfaces an error. */
      }
    },
    [surface, algorithm, variant],
  );

  useEffect(() => {
    const timer = window.setInterval(() => flush(false), FLUSH_MS);
    function onHidden() {
      if (document.visibilityState === "hidden") flush(true);
    }
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", onHidden);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", onHidden);
      flush(true);
    };
  }, [flush]);

  const track = useCallback((e: Event) => {
    queue.current.push(e);
    if (queue.current.length > MAX_BATCH * 2) queue.current.splice(0, queue.current.length - MAX_BATCH);
  }, []);

  return <TelemetryContext.Provider value={{ track, servedKey }}>{children}</TelemetryContext.Provider>;
}

/*
  Remember a post as seen in the cp_seen cookie, so the NEXT request (a
  refresh, Show more) ranks it behind unseen posts immediately. The beacon
  above records the same fact durably, for learning; this is only the fast path.
  A blocked cookie just means the history path catches up a few seconds later.
*/
function rememberSeen(postId: string, depth: SeenDepth) {
  try {
    const current = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${SEEN_COOKIE}=`))
      ?.slice(SEEN_COOKIE.length + 1);
    const next = addToSeenCookie(current ?? null, postId, depth, Date.now());
    document.cookie = `${SEEN_COOKIE}=${next}; path=/; max-age=${SEEN_COOKIE_MAX_AGE_S}; samesite=lax`;
  } catch {
    /* Cookies unavailable: the recorded impression still reaches ranking. */
  }
}

/* ------------------------------------------------------------ dismissal */

type Dismiss = {
  dismiss: (message: string, undo: () => Promise<boolean>) => void;
};

const DismissContext = createContext<Dismiss | null>(null);

/*
  One post in a ranked list. Records its own impression, dwell and open, and
  collapses to a one line note when the person says not interested, with an
  undo that puts it back. The post stays mounted while collapsed so undo is
  instant.
*/
export function FeedItem({
  postId,
  position,
  reason,
  expectedReadMs = null,
  children,
}: {
  postId: string;
  position: number;
  reason: string | null;
  /* feed_v3: dwell is capped at READ.DWELL_CAP_FACTOR times this. */
  expectedReadMs?: number | null;
  children: ReactNode;
}) {
  const telemetry = useContext(TelemetryContext);
  const ref = useRef<HTMLDivElement>(null);
  const [dismissed, setDismissed] = useState<{ message: string; undo: () => Promise<boolean> } | null>(null);
  const [undoError, setUndoError] = useState(false);
  const [undoing, startUndo] = useTransition();

  useEffect(() => {
    const node = ref.current;
    if (!node || !telemetry) return;

    let visibleSince: number | null = null;
    let dwell = 0;
    let impressed = false;
    let impressionTimer: number | null = null;

    /* Delivered (feed_v3 served state): once per page clock. */
    if (telemetry.servedKey && firstServe(telemetry.servedKey, postId)) {
      telemetry.track({ postId, event: "serve", position, reason });
      rememberSeen(postId, "served");
    }

    /* A visible span, counted only while the page was attended to. */
    const span = (from: number, to: number) => Math.max(0, Math.min(to, activeUntil()) - from);
    const capped = (ms: number) =>
      expectedReadMs ? Math.min(ms, expectedReadMs * READ.DWELL_CAP_FACTOR) : ms;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const now = performance.now();
        if (entry.intersectionRatio >= VISIBLE_RATIO) {
          if (visibleSince === null) visibleSince = now;
          if (!impressed && impressionTimer === null) {
            impressionTimer = window.setTimeout(() => {
              impressed = true;
              telemetry.track({ postId, event: "impression", position, reason });
              rememberSeen(postId, "brief");
            }, IMPRESSION_MS);
          }
        } else {
          if (visibleSince !== null) dwell += span(visibleSince, now);
          visibleSince = null;
          dwell = capped(dwell);
          /* Reported each time the card leaves the screen, not only on unmount,
             so a tab that is simply closed still sent what was read. */
          if (impressed && dwell >= MIN_DWELL_MS) {
            telemetry.track({ postId, event: "dwell", position, dwellMs: Math.round(dwell), reason });
            if (dwell >= SEEN.VIEWED_DWELL_MS) {
              rememberSeen(postId, dwell >= SEEN.CONSUMED_DWELL_MS ? "consumed" : "viewed");
            }
            dwell = 0;
          }
          if (impressionTimer !== null && !impressed) {
            window.clearTimeout(impressionTimer);
            impressionTimer = null;
          }
        }
      },
      { threshold: [0, VISIBLE_RATIO, 1] },
    );
    observer.observe(node);

    /* An open is a click on anything in the card that goes to the post. */
    function onClick(e: MouseEvent) {
      const a = (e.target as HTMLElement | null)?.closest("a");
      if (a && a.getAttribute("href") === `/community/${postId}`) {
        telemetry!.track({ postId, event: "open", position, reason });
        rememberSeen(postId, "viewed");
      }
    }
    node.addEventListener("click", onClick);

    return () => {
      observer.disconnect();
      node.removeEventListener("click", onClick);
      if (impressionTimer !== null) window.clearTimeout(impressionTimer);
      if (visibleSince !== null) dwell += span(visibleSince, performance.now());
      dwell = capped(dwell);
      if (impressed && dwell >= MIN_DWELL_MS) {
        telemetry.track({ postId, event: "dwell", position, dwellMs: Math.round(dwell), reason });
      }
    };
  }, [telemetry, postId, position, reason, expectedReadMs]);

  const dismiss = useCallback((message: string, undo: () => Promise<boolean>) => {
    setUndoError(false);
    setDismissed({ message, undo });
  }, []);

  return (
    <DismissContext.Provider value={{ dismiss }}>
      <div ref={ref} hidden={Boolean(dismissed)}>
        {children}
      </div>
      {dismissed ? (
        <div
          role="status"
          className="flex min-h-14 items-center justify-between gap-3 border-b border-border px-4 py-3 text-[14px] text-muted sm:px-5"
        >
          <span>{undoError ? "That could not be undone. Try again." : dismissed.message}</span>
          <button
            type="button"
            disabled={undoing}
            onClick={() =>
              startUndo(async () => {
                /* Only put the post back once the row is really gone, so the
                   screen never claims an undo the database did not do. */
                if (await dismissed.undo()) setDismissed(null);
                else setUndoError(true);
              })
            }
            className="inline-flex h-11 shrink-0 cursor-pointer items-center rounded-full px-3 text-foreground underline underline-offset-4 transition-colors duration-200 ease-out hover:text-muted disabled:opacity-50"
          >
            {undoing ? "Undoing" : "Undo"}
          </button>
        </div>
      ) : null}
    </DismissContext.Provider>
  );
}

/* ---------------------------------------------------------------- menu */

/*
  Not interested, mute the author, mute the topic. A small menu rather than
  three buttons on every card, and no browser dialogs (the standing rule).
  Rendered only for a signed in person, on somebody else's post, in a ranked
  feed: outside a FeedItem there is nothing to collapse and it is not shown.
*/
export function FeedbackMenu({
  postId,
  authorId,
  authorName,
  topic,
}: {
  postId: string;
  authorId: string;
  authorName: string;
  topic: { id: string; name: string } | null;
}) {
  const dismissCtx = useContext(DismissContext);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    }
    function onPointer(e: PointerEvent) {
      const t = e.target as Node;
      if (panel.current?.contains(t) || trigger.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  if (!dismissCtx) return null;

  function choose(targetType: "post" | "author" | "topic", targetId: string) {
    setError(null);
    start(async () => {
      const res = await setFeedFeedback({ targetType, targetId });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setOpen(false);
      dismissCtx!.dismiss(res.message, async () => {
        const undone = await setFeedFeedback({ targetType, targetId, undo: true });
        return undone.ok;
      });
    });
  }

  const item =
    "flex min-h-11 w-full cursor-pointer items-center rounded-lg px-3 text-start text-[14px] text-foreground transition-colors duration-200 ease-out hover:bg-surface disabled:opacity-50";

  return (
    <div className="relative ms-auto">
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          /* 44px target, pulled into the byline's line height with a negative
             margin so the row does not grow. */
          "-my-3 inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground",
          open && "text-foreground",
        )}
      >
        <EyeOff className="size-4" aria-hidden />
        <span className="sr-only">Show less like this</span>
      </button>

      {open ? (
        <div
          ref={panel}
          role="menu"
          aria-label="Tune your feed"
          className="absolute end-0 top-full z-20 mt-1 w-64 rounded-2xl border border-border bg-background p-1"
        >
          <button type="button" role="menuitem" disabled={pending} className={item} onClick={() => choose("post", postId)}>
            Not interested in this post
          </button>
          <button type="button" role="menuitem" disabled={pending} className={item} onClick={() => choose("author", authorId)}>
            <span className="truncate">Mute {authorName}</span>
          </button>
          {topic ? (
            <button type="button" role="menuitem" disabled={pending} className={item} onClick={() => choose("topic", topic.id)}>
              <span className="truncate">Mute the {topic.name} topic</span>
            </button>
          ) : null}
          {error ? (
            <p role="alert" className="px-3 py-2 text-[13px] text-foreground">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
