"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Flag, Link2, MoreHorizontal, ThumbsDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SaveToCollection } from "@/components/collections/save-to-collection";
import { reportItem, type ReportState } from "@/app/actions/community";

/*
  The three dot menu on a video: save, not interested, copy link, report.

  EVERY ONE OF THESE REUSES SOMETHING THAT ALREADY EXISTS. Save is the collection
  picker the rest of the product uses, unchanged, rendered as a menu row. Report
  is reportItem and the same seven reasons the reports table constrains. Copy link
  is the share flow the post card already has. Nothing here is a second system,
  which is the rule that matters most in this menu: a duplicate report path would
  mean a moderation queue that misses half its reports.

  NOT INTERESTED IS THE ONLY NEW SIGNAL, and it is an event rather than a system.
  There is no hide-this-post table, no per person blocklist and no ranker to feed,
  so a row in post_video_events is exactly what it is worth today: a recorded
  preference for whoever builds the ranking later. The slide advances so the
  answer is visibly taken, and nothing pretends the video will never be seen
  again, because nothing yet can promise that.

  NO BROWSER DIALOGS. No confirm(), no alert(): they block every later event in
  the tab, which is the standing rule in this codebase.
*/

const REASONS: { value: string; label: string }[] = [
  { value: "spam", label: "Spam" },
  { value: "abuse", label: "Abuse" },
  { value: "harassment", label: "Harassment" },
  { value: "offtopic", label: "Off topic" },
  { value: "illegal", label: "Illegal" },
  { value: "security", label: "Security" },
  { value: "other", label: "Something else" },
];

export function VideoMoreMenu({
  postId,
  postUrl,
  saved,
  signedIn,
  onSave,
  onReport,
  onNotInterested,
  onShare,
}: {
  postId: string;
  postUrl: string;
  saved: boolean;
  signedIn: boolean;
  onSave?: () => void;
  onReport?: () => void;
  onNotInterested?: () => void;
  onShare?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const [reportState, report, reportPending] = useActionState<ReportState, FormData>(
    reportItem,
    { status: "idle", message: "" },
  );

  /* Escape unwinds one layer at a time, innermost first: the report form, then
     the menu. The same rule PostControls follows. */
  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      /* Stops the viewer's own Escape handler closing the whole page while a
         menu is open on top of it. */
      e.stopPropagation();
      if (reporting) setReporting(false);
      else {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    function onPointer(e: PointerEvent) {
      if (!panelRef.current) return;
      const target = e.target as Node;
      if (panelRef.current.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
      setReporting(false);
    }

    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, reporting]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(postUrl);
      setCopied(true);
      onShare?.();
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* A blocked clipboard is not worth an error. */
    }
  }

  function notInterested() {
    setDismissed(true);
    onNotInterested?.();
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-white transition-colors duration-200 ease-out hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <MoreHorizontal className="size-7 drop-shadow" aria-hidden />
        <span className="sr-only">More actions for this video</span>
      </button>

      {open ? (
        <div
          ref={panelRef}
          role="menu"
          aria-label="Video actions"
          /* Anchored to the rail and pulled inside the viewport. end-0 keeps it
             off the right edge at 390px, where a menu hanging off the rail would
             be half cut away. */
          className="absolute bottom-0 end-full me-2 w-56 overflow-hidden rounded-2xl border border-border bg-background p-1 text-foreground shadow-none"
        >
          {reporting ? (
            <form action={report} className="p-2">
              <input type="hidden" name="entityType" value="post" />
              <input type="hidden" name="entityId" value={postId} />

              <p className="px-1 pb-2 text-[13px] font-medium">Why are you reporting this?</p>

              <div className="max-h-56 overflow-y-auto">
                {REASONS.map((reason) => (
                  <label
                    key={reason.value}
                    className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-[14px] transition-colors duration-200 ease-out hover:bg-surface"
                  >
                    <input
                      type="radio"
                      name="reason"
                      value={reason.value}
                      required
                      className="size-4 accent-current"
                    />
                    {reason.label}
                  </label>
                ))}
              </div>

              {reportState.message ? (
                <p
                  role={reportState.status === "error" ? "alert" : "status"}
                  className="px-1 pt-2 text-[13px] text-muted"
                >
                  {reportState.message}
                </p>
              ) : null}

              <div className="flex gap-2 px-1 pt-2">
                <button
                  type="submit"
                  disabled={reportPending}
                  onClick={() => onReport?.()}
                  className="inline-flex h-10 flex-1 cursor-pointer items-center justify-center rounded-lg bg-foreground px-3 text-[14px] font-medium text-background disabled:opacity-50"
                >
                  {reportPending ? "Sending" : "Report"}
                </button>
                <button
                  type="button"
                  onClick={() => setReporting(false)}
                  className="inline-flex h-10 cursor-pointer items-center justify-center rounded-lg px-3 text-[14px] text-muted hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              {/*
                THE COLLECTION PICKER, NOT A SECOND SAVE. Rendered as a menu row
                so it reads like one, but it is the same component and the same
                RPCs the tool page and the feed card use.
              */}
              <SaveToCollection
                entityType="post"
                entityId={postId}
                initialSaved={saved}
                signedIn={signedIn}
                variant="menu"
                onSaved={onSave}
                className="w-full"
              />

              <MenuItem onClick={notInterested} icon={<ThumbsDown className="size-[18px]" aria-hidden />}>
                {dismissed ? "Noted" : "Not interested"}
              </MenuItem>

              <MenuItem
                onClick={copyLink}
                icon={
                  copied ? (
                    <Check className="size-[18px]" aria-hidden />
                  ) : (
                    <Link2 className="size-[18px]" aria-hidden />
                  )
                }
              >
                {copied ? "Link copied" : "Copy link"}
              </MenuItem>

              {signedIn ? (
                <MenuItem
                  onClick={() => setReporting(true)}
                  icon={<Flag className="size-[18px]" aria-hidden />}
                >
                  Report
                </MenuItem>
              ) : null}

              <MenuItem
                onClick={() => {
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                icon={<X className="size-[18px]" aria-hidden />}
              >
                Close
              </MenuItem>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  onClick,
  icon,
  children,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-start text-[14px]",
        "transition-colors duration-200 ease-out hover:bg-surface",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
      )}
    >
      <span className="shrink-0 text-muted">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
}
