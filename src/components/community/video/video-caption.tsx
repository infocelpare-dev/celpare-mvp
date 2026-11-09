"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { Link2 } from "lucide-react";
import { hostOf } from "@/lib/format";
import { cn } from "@/lib/utils";
import { splitMentions } from "@/lib/community/mentions";

/*
  The caption under a video: the body, its hashtags, and the link if there is one.

  COLLAPSED TO TWO LINES, EXPANDABLE. The brief asks that text not cover a large
  part of the video, and a 900 character post would otherwise fill the frame. Two
  lines is the amount that tells somebody whether they want the rest.

  IT IS EXPANDED BY A BUTTON, NOT BY line-clamp ALONE. A clamp hides text from
  sight but leaves it in the accessibility tree, so a screen reader reads all 900
  characters while a sighted person sees two lines. The button makes the two
  agree, and `more` is a real control with a name rather than an ellipsis nobody
  can press.

  HASHTAGS GO TO SEARCH, because search is a surface that exists and a hashtag
  system is not one. Celpare has no tag table, no tag pages and no tag following,
  so linking a hashtag to /search?q= is the honest version: it does what somebody
  pressing it expects and invents nothing. If tags become real, this is the one
  place that changes.
*/

/* Splits a body into text and hashtags without a parser: a hash followed by word
   characters, not preceded by one, so a URL fragment and a C# in prose are left
   alone. */
const HASHTAG = /(^|\s)(#[\p{L}\p{N}_]{1,50})/gu;

function renderBody(body: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let key = 0;

  /* Plain text between hashtags may hold @mentions, which link to the person
     (lib/community/mentions.ts, the same rule the database notifies by). */
  function pushText(text: string) {
    for (const part of splitMentions(text)) {
      if (part.kind === "text") {
        out.push(part.text);
      } else {
        out.push(
          <Link
            key={`at-${key++}`}
            href={`/u/${part.username}`}
            className="font-medium text-white underline decoration-white/40 underline-offset-4 hover:decoration-white"
          >
            {part.text}
          </Link>,
        );
      }
    }
  }

  for (const match of body.matchAll(HASHTAG)) {
    const index = match.index ?? 0;
    const lead = match[1] ?? "";
    const tag = match[2] ?? "";
    const start = index + lead.length;

    if (start > last) pushText(body.slice(last, start));

    out.push(
      <Link
        key={`tag-${key++}`}
        href={`/search?q=${encodeURIComponent(tag.slice(1))}`}
        className="font-medium text-white underline decoration-white/40 underline-offset-4 hover:decoration-white"
      >
        {tag}
      </Link>,
    );
    last = start + tag.length;
  }

  if (last < body.length) pushText(body.slice(last));
  return out;
}

export function VideoCaption({ body, linkUrl }: { body: string; linkUrl: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  /*
    Whether the two line clamp is actually hiding anything, MEASURED (founder,
    2026-11-09: "see more isn't working at reels"). The old guess (over 120
    characters or 2 lines) drew no button for a shorter caption that a phone
    still cut to two lines, and tapping the cut text did nothing, which a replay
    recorded. Re-measured when the width changes (rotation, resize).
  */
  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el || expanded) return;
    const measure = () => setClamped(el.scrollHeight > el.clientHeight + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [body, expanded]);

  const canToggle = clamped || expanded;

  return (
    <div className="text-[14px] leading-relaxed text-white">
      <p
        ref={textRef}
        /* Tapping the caption itself opens and closes it, which is what people
           try first. A hashtag inside it still goes to its search. */
        onClick={(e) => {
          if (!canToggle || (e.target as HTMLElement).closest("a")) return;
          setExpanded((v) => !v);
        }}
        className={cn(
          "whitespace-pre-wrap break-words",
          canToggle && "cursor-pointer",
          expanded
            ? /* Open, but never over the whole video: it scrolls past this. */
              "max-h-[45dvh] overflow-y-auto overscroll-contain"
            : "line-clamp-2",
        )}
      >
        {renderBody(body)}
      </p>

      {canToggle ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-0.5 flex min-h-11 cursor-pointer items-center text-[13px] font-semibold text-white/85 transition-colors duration-200 ease-out hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          {expanded ? "See less" : "See more"}
        </button>
      ) : null}

      {linkUrl ? (
        <a
          href={linkUrl}
          target="_blank"
          /* ugc and nofollow: a link a stranger supplied. noopener is what stops
             the new tab reaching window.opener. Same rule the post card uses. */
          rel="noopener noreferrer nofollow ugc"
          className="mt-2 inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full border border-white/30 px-3 text-[13px] text-white transition-colors duration-200 ease-out hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <Link2 className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{hostOf(linkUrl)}</span>
        </a>
      ) : null}
    </div>
  );
}
