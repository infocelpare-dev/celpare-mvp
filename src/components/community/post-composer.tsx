"use client";

import { useRef, useState } from "react";
import { CircleAlert, ImagePlus, Video } from "lucide-react";
import { MAX_POST_IMAGES } from "@/lib/community/media";
import { cn } from "@/lib/utils";
import { MediaGrid, usePostMedia } from "./post-media-upload";

/*
  The writing area of a post: text, previews and the attach buttons in one
  card, the way a composer on LinkedIn or X is one surface rather than a stack
  of labelled fields (founder, 2026-10-01: "professional, not vibe coded").

  The textarea keeps name="body" and the form stays uncontrolled from the
  outside, so ComposerForm's keyed remount still restores a refused post: the
  value lives here, seeded from defaultBody on every mount.

  Focus shows as the card's border lifting to the foreground colour, which is
  why the textarea may carry focus-ring-none (see globals.css). Drag and paste
  are shortcuts only; the buttons remain the keyboard path.
*/
export function PostComposer({
  defaultBody,
  invalid,
  limit,
  className,
}: {
  defaultBody: string;
  invalid: boolean;
  limit: number;
  className?: string;
}) {
  const [body, setBody] = useState(defaultBody);
  const [dragging, setDragging] = useState(false);
  /* dragenter and dragleave fire for every child crossed, so a counter, not a
     boolean, decides when the pointer has really left the card. */
  const depth = useRef(0);
  const media = usePostMedia();

  const used = body.length;
  const over = used > limit;
  const near = !over && used > limit * 0.9;

  const status = media.hasVideo
    ? "1 video"
    : media.imageCount > 0
      ? `${media.imageCount} of ${MAX_POST_IMAGES} images`
      : `Up to ${MAX_POST_IMAGES} images or 1 video`;

  function hasFiles(e: React.DragEvent) {
    return Array.from(e.dataTransfer.types).includes("Files");
  }

  return (
    <div className={className}>
      <div
        onDragEnter={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          depth.current += 1;
          setDragging(true);
        }}
        onDragOver={(e) => {
          if (hasFiles(e)) e.preventDefault();
        }}
        onDragLeave={() => {
          depth.current = Math.max(0, depth.current - 1);
          if (depth.current === 0) setDragging(false);
        }}
        onDrop={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          depth.current = 0;
          setDragging(false);
          void media.addFiles(Array.from(e.dataTransfer.files));
        }}
        className={cn(
          "relative rounded-2xl border bg-elevated transition-colors duration-200 ease-out",
          invalid || over
            ? "border-foreground"
            : "border-border focus-within:border-foreground/50",
        )}
      >
        <label htmlFor="post-body" className="sr-only">
          Your post
        </label>
        <textarea
          id="post-body"
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onPaste={(e) => {
            /* A pasted screenshot attaches; pasted text is left alone. */
            const files = Array.from(e.clipboardData.files);
            if (files.length > 0) {
              e.preventDefault();
              void media.addFiles(files);
            }
          }}
          required
          autoFocus
          rows={5}
          placeholder="Share what you found, shipped, or got stuck on"
          aria-invalid={invalid || over || undefined}
          aria-describedby="post-body-count"
          className="focus-ring-none block max-h-[60vh] min-h-[148px] w-full resize-none bg-transparent px-5 pb-3 pt-4 text-[16px] leading-[1.6] text-foreground [field-sizing:content] placeholder:text-muted"
        />

        {media.items.length + media.pending.length > 0 ? (
          <div className="px-4 pb-4">
            <MediaGrid items={media.items} pending={media.pending} onRemove={media.remove} />
          </div>
        ) : null}

        <div className="flex items-center gap-1 border-t border-border px-2 py-1">
          <ToolbarButton
            icon={<ImagePlus className="size-[18px]" aria-hidden />}
            label="Photo"
            title={`PNG, JPEG or WebP, up to ${MAX_POST_IMAGES}, 5 MB each`}
            disabled={!media.canAddImage}
            onClick={media.pickImages}
          />
          <ToolbarButton
            icon={<Video className="size-[18px]" aria-hidden />}
            label="Video"
            title="One MP4 or WebM, up to 50 MB, on its own"
            disabled={!media.canAddVideo}
            onClick={media.pickVideo}
          />
          <span className="ms-2 hidden truncate text-[13px] text-muted sm:inline">
            {media.busy ? "Uploading" : status}
          </span>
          <span
            id="post-body-count"
            /* Silent until it matters, then it speaks once. */
            role={over || near ? "status" : undefined}
            aria-atomic="true"
            className={cn(
              "ms-auto shrink-0 pe-3 text-[13px] tabular-nums",
              over ? "font-medium text-foreground" : "text-muted",
            )}
          >
            {over ? `${used - limit} over` : `${used.toLocaleString()} / ${limit.toLocaleString()}`}
          </span>
        </div>

        {dragging ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-2xl border-2 border-dashed border-foreground bg-elevated/90">
            <p className="text-[15px] font-medium text-foreground">Drop images or a video</p>
          </div>
        ) : null}
      </div>

      {media.error ? (
        <p role="alert" className="mt-2 flex items-start gap-1.5 text-[13px] text-foreground">
          <CircleAlert className="mt-px size-4 shrink-0" aria-hidden />
          {media.error}
        </p>
      ) : null}

      {/* Announced only while it is happening, so nothing is read on load. */}
      {media.busy ? (
        <p role="status" className="sr-only">
          Uploading
        </p>
      ) : null}

      {media.inputs}
    </div>
  );
}

function ToolbarButton({
  icon,
  label,
  title,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full px-3 text-[14px] font-medium text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted"
    >
      {icon}
      {label}
    </button>
  );
}
