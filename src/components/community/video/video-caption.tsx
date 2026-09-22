"use client";

import Link from "next/link";
import { useState } from "react";
import { Link2 } from "lucide-react";
import { hostOf } from "@/lib/format";

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

  for (const match of body.matchAll(HASHTAG)) {
    const index = match.index ?? 0;
    const lead = match[1] ?? "";
    const tag = match[2] ?? "";
    const start = index + lead.length;

    if (start > last) out.push(body.slice(last, start));

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

  if (last < body.length) out.push(body.slice(last));
  return out;
}

export function VideoCaption({ body, linkUrl }: { body: string; linkUrl: string | null }) {
  const [expanded, setExpanded] = useState(false);

  /* Whether a `more` control is worth drawing at all. Measuring the rendered
     height would be exact and would also mean a layout read on every slide; this
     is the cheap approximation, and being slightly generous only means the
     button appears over text that did happen to fit. */
  const long = body.length > 120 || body.split("\n").length > 2;

  return (
    <div className="text-[14px] leading-relaxed text-white">
      <p
        className={
          expanded
            ? "whitespace-pre-wrap break-words"
            : "line-clamp-2 whitespace-pre-wrap break-words"
        }
      >
        {renderBody(body)}
      </p>

      {long ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-1 inline-flex min-h-11 cursor-pointer items-center text-[13px] font-medium text-white/80 transition-colors duration-200 ease-out hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          {expanded ? "Show less" : "Show more"}
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
