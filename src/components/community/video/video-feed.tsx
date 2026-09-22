"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { toggleLike, toggleRepost } from "@/app/actions/community";
import { toggleFollow } from "@/app/actions/follow";
import type { VideoPost } from "@/lib/community/video";
import type { VideoSource } from "@/lib/community/video-analytics";
import { VideoPlayer, type PlaybackState } from "./video-player";
import { VideoOverlay } from "./video-overlay";
import { useVideoEvents, type TrackFn } from "./use-video-events";

/*
  The vertical video viewer.

  THE SWIPE IS NATIVE SCROLL SNAPPING, NOT A GESTURE HANDLER. CSS scroll-snap
  gives momentum, rubber banding, interruption and settling that no touch handler
  reproduces, and it costs nothing on the main thread. It also means the gesture
  cannot conflict with anything, which is the ux guidance's actual worry: a custom
  vertical drag would fight text selection, the caption's own scroll, the browser's
  pull to refresh and every assistive technology that drives scrolling
  programmatically. The keyboard, a scrollbar, a screen reader and a trackpad all
  work here for free because none of them is being intercepted.

  WHICH ONE IS ACTIVE IS DECIDED BY AN IntersectionObserver, not by scroll maths.
  One observer for the whole list, threshold at 60 percent, so exactly one slide
  is active at a time and that is what guarantees only one video ever plays: the
  player pauses itself the moment `active` goes false.

  ONLY THREE SLIDES ARE REAL PLAYERS at any moment: the active one and its two
  neighbours. Everything else renders a poster and no <video> element at all, so
  a list of thirty videos is three media pipelines rather than thirty. That is the
  whole of the performance requirement, and it is structural rather than a
  cleanup pass.

  THE LIST IS A PROP AND THIS COMPONENT NEVER FETCHES. It does not know or care
  whether the order came from the feed, from Following, or one day from a ranker.
  That is the future proofing the brief asks for, and it is the reason there is no
  query anywhere in this file.
*/

/* Percentages worth recording. Not every tick: onTimeUpdate fires about four
   times a second, and a row each would be thousands per video. */
const MILESTONES = [25, 50, 75, 95] as const;

export function VideoFeed({
  posts,
  liked,
  saved,
  reposted,
  following,
  viewerId,
  signedIn,
  source = "video",
  backHref = "/community",
}: {
  posts: VideoPost[];
  /* Post ids the viewer has already liked, saved or reposted, and the author ids
     they already follow, all from the server, so every control arrives in the
     right state rather than flickering after hydration. */
  liked: string[];
  saved: string[];
  reposted: string[];
  following: string[];
  viewerId: string | null;
  signedIn: boolean;
  source?: VideoSource;
  backHref?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const track = useVideoEvents(source);

  /* useMemo, not useRef: these ARE read during render, to decide whether a heart
     arrives filled, and a ref read in render is the cascade react-hooks/refs
     exists to stop. They are derived from props and change only when the server
     hands down a new list. */
  const likedSet = useMemo(() => new Set(liked), [liked]);
  const savedSet = useMemo(() => new Set(saved), [saved]);
  const repostedSet = useMemo(() => new Set(reposted), [reposted]);
  const followingSet = useMemo(() => new Set(following), [following]);

  /* What the active video has reported most recently, so a swipe can say how
     much of the one being left was actually watched. A ref rather than state:
     it changes four times a second and nothing renders from it. */
  const progress = useRef<{ watchMs: number; percent: number; durationMs: number }>({
    watchMs: 0,
    percent: 0,
    durationMs: 0,
  });
  const lastIndex = useRef(0);

  /* Which milestones have been recorded for the current activation, cleared when
     the active slide changes so returning to a video records them again. */
  const fired = useRef<Set<number>>(new Set());

  /*
    Active slide detection.

    Re-created when the number of posts changes, because the observed nodes do.
    Threshold 0.6 rather than 0.5: with mandatory snapping two slides are never
    both 60 percent visible, so there is no moment where two are active and two
    videos could play.
  */
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.6) continue;
          const index = Number((entry.target as HTMLElement).dataset.index);
          if (Number.isNaN(index)) continue;
          setActiveIndex(index);
        }
      },
      { root: scroller, threshold: [0.6] },
    );

    for (const node of slideRefs.current) {
      if (node) observer.observe(node);
    }
    return () => observer.disconnect();
  }, [posts.length]);

  /*
    Record the move, and the impression of what was arrived at.

    The direction is the index comparison, which is the honest definition: a
    scroll, a keypress, a Next button and a screen reader's own navigation all
    produce the same two events, because all four are the same thing happening.
  */
  useEffect(() => {
    const from = lastIndex.current;
    if (from === activeIndex) return;

    const leaving = posts[from];
    if (leaving) {
      track(activeIndex > from ? "swipe_next" : "swipe_previous", leaving.id, {
        position: from,
        watchMs: progress.current.watchMs,
        percentWatched: progress.current.percent,
        durationMs: progress.current.durationMs,
      });
    }

    lastIndex.current = activeIndex;
    progress.current = { watchMs: 0, percent: 0, durationMs: 0 };
    fired.current = new Set();
  }, [activeIndex, posts, track]);

  /* The impression for whatever is active, including the first one on arrival. */
  useEffect(() => {
    const post = posts[activeIndex];
    if (post) track("impression", post.id, { position: activeIndex });
  }, [activeIndex, posts, track]);

  const goTo = useCallback((index: number) => {
    const node = slideRefs.current[index];
    if (!node) return;
    /* scrollIntoView rather than setting scrollTop, so the snap points and the
       browser's own smooth scrolling do the work. */
    node.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  /*
    Keyboard navigation.

    The brief is explicit that important actions must not depend only on a
    gesture. Arrow keys and Page Up/Down move between videos, Home and End jump to
    the ends, and Escape leaves. Space and Enter are deliberately NOT handled here:
    they belong to whichever control has focus, and stealing them would break the
    play button, the menu and every link in the overlay.
  */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      /* Never while somebody is typing, and never while a menu or dialog above
         this is handling its own keys. */
      if (target?.closest("input, textarea, select, [role='menu'], dialog[open]")) return;

      switch (e.key) {
        case "ArrowDown":
        case "PageDown":
          e.preventDefault();
          goTo(Math.min(activeIndex + 1, posts.length));
          break;
        case "ArrowUp":
        case "PageUp":
          e.preventDefault();
          goTo(Math.max(activeIndex - 1, 0));
          break;
        case "Home":
          e.preventDefault();
          goTo(0);
          break;
        case "End":
          e.preventDefault();
          goTo(posts.length - 1);
          break;
        case "m":
        case "M":
          setMuted((v) => !v);
          break;
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeIndex, goTo, posts.length]);

  if (posts.length === 0) {
    return <AllCaughtUp backHref={backHref} empty />;
  }

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-black">
      {/*
        Back out of the viewer. A real link, so the browser's own back gesture and
        this button do the same thing and the feed keeps its scroll position.
      */}
      <Link
        href={backHref}
        className="absolute start-3 top-3 z-30 inline-flex size-11 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-colors duration-200 ease-out hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <ArrowLeft className="size-5" aria-hidden />
        <span className="sr-only">Back to the feed</span>
      </Link>

      <div
        ref={scrollerRef}
        /*
          overscroll-contain stops a swipe past the last video pulling the page
          behind it, which on iOS is how somebody accidentally triggers a reload.
          The scroller is focusable so the arrow keys work before anything inside
          has been touched.
        */
        tabIndex={-1}
        aria-label="Videos"
        className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain scroll-smooth"
      >
        {posts.map((post, index) => (
          <section
            key={post.id}
            data-index={index}
            ref={(node) => {
              slideRefs.current[index] = node;
            }}
            aria-label={`Video ${index + 1} of ${posts.length}`}
            aria-current={index === activeIndex ? "true" : undefined}
            className="relative h-[100dvh] w-full snap-start snap-always"
          >
            {/*
              DESKTOP IS A CENTRED COLUMN, NOT THE PHONE UI STRETCHED. A video
              filling a 27 inch screen is unwatchable and letterboxes to black
              anyway. The frame is capped at a portrait column and centred, which
              is what every desktop version of this pattern settled on, and the
              controls stay exactly where they are inside it.
            */}
            <div className="mx-auto h-full w-full sm:max-w-[min(480px,calc(100dvh*9/16))]">
              <Slide
                post={post}
                index={index}
                active={index === activeIndex}
                near={Math.abs(index - activeIndex) === 1}
                muted={muted}
                onToggleMuted={() => setMuted((v) => !v)}
                liked={likedSet.has(post.id)}
                saved={savedSet.has(post.id)}
                reposted={repostedSet.has(post.id)}
                following={followingSet.has(post.author_id)}
                viewerId={viewerId}
                signedIn={signedIn}
                track={track}
                onProgress={(info) => {
                  if (index !== activeIndex) return;
                  progress.current = info;
                  for (const milestone of MILESTONES) {
                    if (info.percent >= milestone && !fired.current.has(milestone)) {
                      fired.current.add(milestone);
                      track("progress", post.id, {
                        position: index,
                        watchMs: info.watchMs,
                        percentWatched: milestone,
                        durationMs: info.durationMs,
                      });
                    }
                  }
                }}
              />
            </div>
          </section>
        ))}

        {/* The end, rather than an infinite blank. It is a snap target of its own
            so a swipe past the last video settles on it cleanly. */}
        <section
          data-index={posts.length}
          ref={(node) => {
            slideRefs.current[posts.length] = node;
          }}
          className="relative h-[100dvh] w-full snap-start snap-always"
        >
          <AllCaughtUp backHref={backHref} />
        </section>
      </div>

      {/*
        Previous and next, shown from sm up.

        On a phone these would cover the video for something the swipe already
        does. On a desktop there is no swipe, a trackpad scroll is imprecise over
        a snapping container, and the ux guidance is explicit that advancing
        content needs real previous and next controls. Hidden from assistive
        technology only when they are off screen, never otherwise.
      */}
      <div className="pointer-events-none absolute end-4 top-1/2 z-20 hidden -translate-y-1/2 flex-col gap-3 sm:flex">
        <NavButton
          label="Previous video"
          disabled={activeIndex === 0}
          onClick={() => goTo(Math.max(activeIndex - 1, 0))}
        >
          <ChevronUp className="size-5" aria-hidden />
        </NavButton>
        <NavButton
          label="Next video"
          disabled={activeIndex >= posts.length}
          onClick={() => goTo(Math.min(activeIndex + 1, posts.length))}
        >
          <ChevronDown className="size-5" aria-hidden />
        </NavButton>
      </div>

      {/* Where you are in the list, announced rather than only implied by the
          scrollbar, which a snapping full screen container does not really have. */}
      <p role="status" aria-live="polite" className="sr-only">
        {activeIndex < posts.length
          ? `Video ${activeIndex + 1} of ${posts.length}`
          : "End of videos"}
      </p>
    </div>
  );
}

/*
  One video and everything on top of it.

  THE LIKE LIVES HERE because two things perform it: the heart in the rail and a
  double tap on the frame. One state, one request, one rollback.

  THE DOUBLE TAP DOES NOT DELAY THE SINGLE TAP. The obvious implementation waits
  250ms on every tap to see whether a second one arrives, which makes play and
  pause feel broken. Instead the single tap toggles playback immediately and the
  second tap of a double is allowed to toggle it straight back, so the pair is a
  no-op on playback and a like on the post. The person sees the video keep playing
  and the heart fill, which is what they meant.
*/
function Slide({
  post,
  index,
  active,
  near,
  muted,
  onToggleMuted,
  liked,
  saved,
  reposted,
  following,
  viewerId,
  signedIn,
  track,
  onProgress,
}: {
  post: VideoPost;
  index: number;
  active: boolean;
  near: boolean;
  muted: boolean;
  onToggleMuted: () => void;
  liked: boolean;
  saved: boolean;
  reposted: boolean;
  following: boolean;
  viewerId: string | null;
  signedIn: boolean;
  track: TrackFn;
  onProgress: (info: { watchMs: number; percent: number; durationMs: number }) => void;
}) {
  const [likeOn, setLikeOn] = useState(liked);
  const [likes, setLikes] = useState(post.like_count);
  const [likeError, setLikeError] = useState("");
  const [likePending, startTransition] = useTransition();

  const [repostOn, setRepostOn] = useState(reposted);
  const [reposts, setReposts] = useState(post.repost_count);
  const [repostPending, startRepost] = useTransition();

  const [followOn, setFollowOn] = useState(following);
  const [followPending, startFollow] = useTransition();
  const [burst, setBurst] = useState(false);
  const lastTap = useRef(0);
  const started = useRef(false);

  const like = useCallback(
    (fromGesture: boolean) => {
      if (!signedIn) return;
      /* A double tap only ever LIKES. Nobody double taps to remove a like, and
         making the gesture a toggle means an accidental second double tap
         silently undoes the first. */
      if (fromGesture && likeOn) return;

      const next = !likeOn;
      setLikeOn(next);
      setLikes((n) => Math.max(0, n + (next ? 1 : -1)));
      setLikeError("");
      if (next) {
        track("like", post.id, { position: index });
        setBurst(true);
        window.setTimeout(() => setBurst(false), 600);
      }

      startTransition(async () => {
        const result = await toggleLike("post", post.id, next);
        if (!result.ok) {
          setLikeOn(!next);
          setLikes((n) => Math.max(0, n + (next ? -1 : 1)));
          setLikeError(result.message);
        }
      });
    },
    [index, likeOn, post.id, signedIn, track],
  );

  /* Optimistic with a rollback, the same rule 10-community.md sets for every
     other count in the product. */
  function repost() {
    if (!signedIn) return;
    const next = !repostOn;
    setRepostOn(next);
    setReposts((n) => Math.max(0, n + (next ? 1 : -1)));
    setLikeError("");
    if (next) track("repost", post.id, { position: index });

    startRepost(async () => {
      const result = await toggleRepost(post.id, next);
      if (!result.ok) {
        setRepostOn(!next);
        setReposts((n) => Math.max(0, n + (next ? -1 : 1)));
        setLikeError(result.message);
      }
    });
  }

  /*
    Follow, through the SAME action the profile uses.

    toggleFollow has the useActionState signature, (previous, FormData), so the
    FormData is built here rather than reaching for a second entry point. One
    action means one set of rules: follows_no_self, the composite primary key and
    the trigger owned counts all still apply, and there is no second path that
    could drift from them.
  */
  function follow() {
    if (!signedIn || followOn) return;
    setFollowOn(true);
    setLikeError("");
    track("follow", post.id, { position: index });

    startFollow(async () => {
      const body = new FormData();
      body.set("targetId", post.author_id);
      body.set("intent", "follow");
      const result = await toggleFollow(
        { status: "idle", following: false, message: "" },
        body,
      );
      if (result.status === "error") {
        setFollowOn(false);
        setLikeError(result.message);
      }
    });
  }

  function onPointerUp() {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      like(true);
      lastTap.current = 0;
      return;
    }
    lastTap.current = now;
  }

  function onState(state: PlaybackState) {
    if (state === "playing") {
      if (!started.current) {
        started.current = true;
        track("started", post.id, { position: index });
      } else {
        track("resumed", post.id, { position: index });
      }
    }
    if (state === "paused" && started.current) {
      track("paused", post.id, { position: index });
    }
  }

  return (
    <div className="relative size-full bg-black" onPointerUp={onPointerUp}>
      <VideoPlayer
        video={post.video}
        active={active}
        near={near}
        muted={muted}
        onToggleMuted={onToggleMuted}
        onState={onState}
        onProgress={onProgress}
        onEnded={() => track("completed", post.id, { position: index, percentWatched: 100 })}
        label={`video by ${post.author?.username ?? "someone"}`}
      />

      {/* The double tap's acknowledgement. Without it the gesture is invisible
          and people repeat it. Respects reduced motion by fading rather than
          scaling, and it is aria-hidden because the heart in the rail already
          announces the state change. */}
      {burst ? (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center" aria-hidden>
          <span className="text-[88px] leading-none opacity-90 drop-shadow-lg">♥</span>
        </div>
      ) : null}

      <VideoOverlay
        post={post}
        likeOn={likeOn}
        likes={likes}
        onLike={() => like(false)}
        likePending={likePending}
        likeError={likeError}
        repostOn={repostOn}
        reposts={reposts}
        onRepost={repost}
        repostPending={repostPending}
        following={followOn}
        onFollow={follow}
        followPending={followPending}
        saved={saved}
        signedIn={signedIn}
        viewerId={viewerId}
        onTrack={(event) => track(event, post.id, { position: index })}
      />
    </div>
  );
}

function NavButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "pointer-events-auto inline-flex size-11 cursor-pointer items-center justify-center rounded-full",
        "bg-black/45 text-white backdrop-blur-sm transition-colors duration-200 ease-out",
        "hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
        "disabled:cursor-default disabled:opacity-40",
      )}
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  );
}

/*
  The end of the list, and the empty case, which say different things for a
  reason: running out after watching is an achievement, and arriving at nothing is
  a state of the feed. Neither is a blank screen, which is what the brief rules
  out, and neither invents a "come back later" promise nothing schedules.
*/
function AllCaughtUp({ backHref, empty }: { backHref: string; empty?: boolean }) {
  return (
    <div className="grid h-[100dvh] w-full place-items-center bg-black px-6 text-center">
      <div>
        <p className="font-display text-[22px] font-semibold text-white">
          {empty ? "No videos yet" : "You're all caught up."}
        </p>
        <p className="mx-auto mt-2 max-w-[38ch] text-[14px] leading-relaxed text-white/70">
          {empty
            ? "Nobody has posted a video here yet. When somebody does, it will play here."
            : "That is every video in this feed."}
        </p>
        <Link
          href={backHref}
          className="mt-5 inline-flex h-11 items-center rounded-full bg-white px-5 text-[14px] font-medium text-black transition-opacity duration-200 ease-out hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
          Back to the feed
        </Link>
      </div>
    </div>
  );
}
