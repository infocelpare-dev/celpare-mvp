"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadComments, type ThreadResult } from "@/app/actions/comments";
import { SignInButton } from "@/components/auth/sign-in-prompt";
import { CommentThread } from "./comment-thread";

/*
  Comments in Top, Following or Newest (Comment Intelligence v1, guide 20).

  ONE WRAPPER, BOTH SURFACES. The post page renders the first page on the
  server and passes it in; the video sheet passes the first page it loaded.
  Switching mode or asking for more calls loadComments; the order always comes
  from the server, this component only shows it.

  PAGES NEVER REPEAT. Top and Following send back the root ids already shown
  (seen), Newest sends a keyset cursor, so no comment appears twice and none is
  skipped (rank.ts, takePage).

  IMPRESSIONS ARE REAL ONES. A comment counts as seen when at least half of its
  row was on screen for a second, once per mode per page view, with its position
  and depth. That is what lets ranking correct for exposure later. Dwell alone is
  never sent as a positive signal.
*/

type Mode = ThreadResult["mode"];

const MODES: { id: Mode; label: string }[] = [
  { id: "top", label: "Top" },
  { id: "following", label: "Following" },
  { id: "newest", label: "Newest" },
];

const ENDPOINT = "/api/community/comments/events";
const FLUSH_MS = 10_000;
const VISIBLE_RATIO = 0.5;
const IMPRESSION_MS = 1000;
const MAX_BATCH = 60;

type Impression = { commentId: string; mode: Mode; position: number | null; depth: number; reason: string | null };

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

export function RankedComments({
  postId,
  initial,
  tone = "light",
  onReplied,
  onTotal,
}: {
  postId: string;
  initial: ThreadResult;
  tone?: "light" | "dark";
  /* A surface that keeps its own count (the video rail) follows along. */
  onReplied?: () => void;
  onTotal?: (total: number) => void;
}) {
  const [data, setData] = useState<ThreadResult>(initial);
  const [notice, setNotice] = useState("");
  const [pending, start] = useTransition();
  const dark = tone === "dark";
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(
    (mode: Mode, more: boolean) => {
      setNotice("");
      start(async () => {
        const next = await loadComments({
          postId,
          mode,
          seen: more ? data.seen : [],
          cursor: more ? data.next : null,
        });
        setData((prev) =>
          more
            ? {
                ...next,
                nodes: [...prev.nodes, ...next.nodes.filter((n) => !prev.nodes.some((p) => p.id === n.id))],
                likedIds: [...new Set([...prev.likedIds, ...next.likedIds])],
              }
            : next,
        );
        onTotal?.(next.total);
      });
    },
    [postId, data.seen, data.next, onTotal],
  );

  function choose(mode: Mode) {
    if (mode === data.mode || pending) return;
    if (mode === "following" && !data.signedIn) {
      setNotice("following");
      return;
    }
    load(mode, false);
  }

  /* ------------------------------------------------------- impressions */
  const queue = useRef<Impression[]>([]);
  const counted = useRef(new Set<string>());

  const flush = useCallback(
    (beacon: boolean) => {
      if (queue.current.length === 0) return;
      const events = queue.current.splice(0, MAX_BATCH);
      const body = JSON.stringify({ algorithm: data.algorithm, sessionId: sessionId(), events });
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
    [data.algorithm],
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

  useEffect(() => {
    const root = box.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const timers = new Map<Element, number>();
    const mode = data.mode;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          if (entry.isIntersecting && entry.intersectionRatio >= VISIBLE_RATIO) {
            if (timers.has(el)) continue;
            timers.set(
              el,
              window.setTimeout(() => {
                timers.delete(el);
                const id = el.dataset.cid;
                if (!id || document.visibilityState !== "visible") return;
                const key = `${mode}:${id}`;
                if (counted.current.has(key)) return;
                counted.current.add(key);
                const pos = el.dataset.pos;
                queue.current.push({
                  commentId: id,
                  mode,
                  position: pos === undefined ? null : Number(pos),
                  depth: Number(el.dataset.depth ?? 0),
                  reason: el.dataset.reason ?? null,
                });
              }, IMPRESSION_MS),
            );
          } else {
            const t = timers.get(el);
            if (t !== undefined) window.clearTimeout(t);
            timers.delete(el);
          }
        }
      },
      { threshold: [0, VISIBLE_RATIO, 1] },
    );
    root.querySelectorAll("[data-cid]").forEach((el) => observer.observe(el));
    return () => {
      observer.disconnect();
      for (const t of timers.values()) window.clearTimeout(t);
    };
  }, [data.nodes, data.mode]);

  const empty = data.nodes.length === 0;

  return (
    <div ref={box}>
      <div role="group" aria-label="Sort comments" className="mb-3 flex flex-wrap items-center gap-2">
        {MODES.map((m) => {
          const active = data.mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={active}
              disabled={pending}
              onClick={() => choose(m.id)}
              className={cn(
                "inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-[13px] font-medium",
                "transition-colors duration-200 ease-out disabled:cursor-default",
                dark
                  ? active
                    ? "border-white bg-white text-black"
                    : "border-white/25 text-white/80 hover:bg-white/10"
                  : active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted hover:bg-surface hover:text-foreground",
              )}
            >
              {m.label}
            </button>
          );
        })}
        {pending ? <Loader2 className={cn("size-4 animate-spin", dark ? "text-white/70" : "text-muted")} aria-label="Loading" /> : null}
      </div>

      {notice === "following" ? (
        <p role="status" className={cn("mb-3 text-[13px]", dark ? "text-white/70" : "text-muted")}>
          <SignInButton className="underline underline-offset-4">Sign in</SignInButton> to see comments from people you follow.
        </p>
      ) : null}

      {empty && data.mode === "following" ? (
        <p className={cn("py-6 text-center text-[14px]", dark ? "text-white/60" : "text-muted")}>
          Nobody you follow has commented here yet.
        </p>
      ) : (
        <CommentThread
          nodes={data.nodes}
          postId={postId}
          likedIds={data.likedIds}
          signedIn={data.signedIn}
          viewerId={data.viewerId}
          tone={tone}
          onReplied={() => {
            load(data.mode, false);
            onReplied?.();
          }}
        />
      )}

      {data.hasMore ? (
        <button
          type="button"
          onClick={() => load(data.mode, true)}
          disabled={pending}
          className={cn(
            "mt-2 inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full border text-[14px]",
            "transition-colors duration-200 ease-out disabled:opacity-60",
            dark ? "border-white/25 text-white hover:bg-white/10" : "border-border text-foreground hover:bg-surface",
          )}
        >
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Show more comments
        </button>
      ) : null}
    </div>
  );
}
