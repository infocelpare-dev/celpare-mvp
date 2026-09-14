"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/*
  The only part of Avatar that needs to be a client component.

  A remote avatar can fail: an OAuth provider rotates the URL, the host blocks
  the referrer, the person is offline. Without a fallback the result is an empty
  circle, which reads as a bug rather than as a person. Seen for real: the
  founder's own lh3.googleusercontent.com URL returns naturalWidth 0.

  onError alone is NOT enough, and this is the part that is easy to get wrong.
  The browser starts loading the image while parsing the server rendered HTML,
  so it can fail before React hydrates and attaches the handler, and the event
  is then lost forever. The effect below covers exactly that case by asking the
  element what happened rather than waiting to be told: an image that is
  complete with a naturalWidth of zero has already failed.

  A failed load falls back to the same initials a person with no picture gets,
  in identical markup, so nothing shifts.
*/
export function AvatarImage({
  src,
  initials,
  className,
}: {
  src: string;
  initials: string;
  className: string;
}) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const img = ref.current;
    if (!img) return;
    // Already finished, and finished with nothing. The onError we would have
    // listened for fired before this component was ever hydrated.
    if (img.complete && img.naturalWidth === 0) setFailed(true);
  }, [src]);

  if (failed) {
    return (
      <span aria-hidden className={className}>
        {initials}
      </span>
    );
  }

  return (
    /* A plain img, not next/image: next/image needs every remote host
       allowlisted in next.config, and these are third party hosts. This follows
       the Monogram in ask/tool-cards.tsx. */
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      ref={ref}
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn(className, "bg-surface object-cover")}
    />
  );
}
