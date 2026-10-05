"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  CircleAlert,
  CircleCheck,
  ImagePlus,
  Link2,
  Loader2,
  PanelTop,
  Plus,
  Rocket,
  Users,
  Video,
  X,
} from "lucide-react";
import { launchToolFeature, type DeveloperState } from "@/app/actions/developer";
import { Button, ButtonLink } from "@/components/ui/button";
import { imageSize, objectUrl, videoMeta } from "@/components/community/post-media-upload";
import { createClient } from "@/lib/supabase/client";
import {
  CONTENT_TYPE,
  IMAGE_BUCKET,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  SNIFF_BYTES,
  VIDEO_BUCKET,
  sniffImage,
  sniffVideo,
} from "@/lib/tools/media";
import { cn } from "@/lib/utils";

/*
  Launch a new feature, on the tool page itself (D202, founder 2026-10-05).

  The developer never leaves the tool to announce something on it: the button
  opens this as a dialog, and the developer chooses where it appears, the tool
  page only or the tool page and the community feed. The same composer is used
  on /developer/tools/[id]/update for tools that are not published yet, where
  the feed choice is not offered.

  Shaped like the feed composer (UI.2): one card holding the headline, the
  preview and the attach buttons together. One video OR one image OR a link
  only, as before (2026-09-17). Upload goes straight from the browser to the
  tool buckets; launchToolFeature re-reads the bytes, and launch_tool_feature
  writes the update and the post in one transaction.
*/

const LIMIT = 200;
const initial: DeveloperState = { status: "idle", message: "" };

type Media = {
  kind: "image" | "video";
  preview: string;
  url: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
};

export function LaunchFeatureButton(props: {
  toolId: string;
  slug: string;
  toolName: string;
  logoUrl: string | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  /* A fresh composer each time it opens, so a finished launch does not reopen
     on its success screen. */
  const [session, setSession] = useState(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      /* React's autoFocus ran while the dialog was still closed, so showModal
         would land on the close button. Start where the writing starts. */
      dialog.querySelector<HTMLTextAreaElement>("#launch-caption")?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setSession((n) => n + 1);
          setOpen(true);
        }}
      >
        <Plus className="size-4" aria-hidden />
        Launch a new feature
      </Button>

      <dialog
        ref={dialogRef}
        aria-labelledby="launch-title"
        onClose={close}
        onClick={(e) => {
          if (e.target === dialogRef.current) close();
        }}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[min(560px,calc(100vw-2rem))] overflow-y-auto rounded-3xl border border-border bg-background p-0 text-start text-foreground backdrop:bg-black/50"
      >
        {open ? <LaunchComposer key={session} {...props} feedChoice onClose={close} /> : null}
      </dialog>
    </>
  );
}

export function LaunchComposer({
  toolId,
  slug,
  toolName,
  logoUrl,
  feedChoice,
  onClose,
}: {
  toolId: string;
  slug: string;
  toolName: string;
  logoUrl: string | null;
  /* Offered only for a published tool: the feed must never point at a listing
     the public cannot open. The database refuses it either way. */
  feedChoice: boolean;
  onClose?: () => void;
}) {
  const [state, action, pending] = useActionState(launchToolFeature, initial);
  const was = (k: string) => {
    const v = state.values?.[k];
    return typeof v === "string" ? v : "";
  };

  const [caption, setCaption] = useState(was("caption"));
  const [link, setLink] = useState(was("linkUrl"));
  const [showLink, setShowLink] = useState(was("linkUrl") !== "");
  const [audience, setAudience] = useState<"page" | "feed">(
    was("audience") === "feed" ? "feed" : "page",
  );
  const [media, setMedia] = useState<Media | null>(null);
  const [busy, setBusy] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const linkInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showLink) linkInput.current?.focus();
  }, [showLink]);

  /* Let go of the local preview when it is replaced or the dialog closes. */
  useEffect(() => {
    const preview = media?.preview;
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [media?.preview]);

  if (state.status === "success") {
    const postId = was("postId");
    return (
      <div className="px-6 pb-6 pt-8 text-center sm:px-8">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-accent text-on-accent">
          <CircleCheck className="size-7" aria-hidden />
        </span>
        <h2 id="launch-title" className="mt-5 text-[22px] font-medium tracking-[-0.02em]">
          It is live
        </h2>
        <p role="status" className="mt-2 text-[15px] leading-relaxed text-muted">
          {state.message}
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          {postId ? (
            /* The feed itself, with the new post first (?posted, see the feed
               page), not the post's own page. A plain navigation: closing the
               dialog first could swallow the click. */
            <ButtonLink href={`/community?posted=${postId}`}>
              See it in the feed
            </ButtonLink>
          ) : null}
          {onClose ? (
            <Button variant={postId ? "outline" : "primary"} onClick={onClose}>
              Done
            </Button>
          ) : (
            <ButtonLink href={`/tools/${slug}`} variant={postId ? "outline" : "primary"}>
              See it on {toolName}
            </ButtonLink>
          )}
        </div>
      </div>
    );
  }

  async function pick(file: File, kind: "image" | "video") {
    setMediaError(null);
    const isVideo = kind === "video";
    if (file.size === 0) return setMediaError("That file is empty.");
    if (file.size > (isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES)) {
      return setMediaError(isVideo ? "That video is over 50 MB." : "That image is over 5 MB.");
    }
    const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
    const sniffed = isVideo ? sniffVideo(head) : sniffImage(head);
    if (!sniffed) {
      return setMediaError(
        isVideo ? "That file is not an MP4 or WebM video." : "That file is not a PNG, JPEG or WebP image.",
      );
    }

    const preview = objectUrl(file);
    if (!preview) return setMediaError("That file could not be previewed.");
    const video = isVideo ? await videoMeta(file) : null;
    const size = isVideo ? video : await imageSize(file);
    setMedia({
      kind,
      preview,
      url: null,
      width: size?.width ?? null,
      height: size?.height ?? null,
      durationMs: video?.durationMs ?? null,
    });

    setBusy(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setMedia(null);
        return setMediaError("Your session has expired. Reload the page and sign in again.");
      }
      const bucket = isVideo ? VIDEO_BUCKET : IMAGE_BUCKET;
      const path = `${user.id}/${crypto.randomUUID()}.${sniffed}`;
      const { error } = await supabase.storage
        .from(bucket)
        .upload(path, file, { contentType: CONTENT_TYPE[sniffed], upsert: false });
      if (error) {
        console.error("[launch] upload failed", error.message);
        setMedia(null);
        return setMediaError("That did not upload. Check your connection and try again.");
      }
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      setMedia((m) => (m && m.preview === preview ? { ...m, url: data.publicUrl } : m));
    } finally {
      setBusy(false);
    }
  }

  const used = caption.length;
  const over = used > LIMIT;
  const hasSomething = Boolean(media?.url) || link.trim() !== "";
  const canLaunch = caption.trim() !== "" && !over && hasSomething && !busy && !pending;
  const fieldError = state.status === "error" ? state.field : undefined;

  return (
    <form action={action} className="px-5 pb-5 pt-5 sm:px-6 sm:pb-6">
      <input type="hidden" name="toolId" value={toolId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="mediaUrl" value={media?.url ?? ""} />
      <input type="hidden" name="mediaKind" value={media?.url ? media.kind : ""} />
      <input type="hidden" name="width" value={media?.width ?? ""} />
      <input type="hidden" name="height" value={media?.height ?? ""} />
      <input type="hidden" name="duration" value={media?.durationMs ?? ""} />
      <input type="hidden" name="audience" value={feedChoice ? audience : "page"} />

      {/* Header: the tool this is news about, so nobody wonders where it goes. */}
      <div className="flex items-center gap-3 pe-10">
        <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-surface text-[15px] font-medium">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="size-full object-cover" />
          ) : (
            toolName.slice(0, 1).toUpperCase()
          )}
        </span>
        <div className="min-w-0">
          <h2 id="launch-title" className="text-[19px] font-medium leading-tight tracking-[-0.02em]">
            Launch a new feature
          </h2>
          <p className="truncate text-[13px] text-muted">on {toolName}</p>
        </div>
      </div>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="absolute end-3 top-3 inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <X className="size-5" aria-hidden />
          <span className="sr-only">Close</span>
        </button>
      ) : null}

      {/* The card: headline, preview, link and attach buttons together. */}
      <div
        className={cn(
          "mt-5 rounded-2xl border bg-elevated transition-colors duration-200 ease-out",
          over || fieldError === "caption" ? "border-foreground" : "border-border focus-within:border-foreground/50",
        )}
      >
        <label htmlFor="launch-caption" className="sr-only">
          What did you ship?
        </label>
        <textarea
          id="launch-caption"
          name="caption"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          required
          autoFocus
          rows={2}
          placeholder="What did you ship?"
          aria-describedby="launch-count"
          aria-invalid={over || fieldError === "caption" || undefined}
          className="focus-ring-none block min-h-[76px] w-full resize-none bg-transparent px-5 pb-2 pt-4 text-[18px] font-medium leading-[1.45] tracking-[-0.01em] text-foreground [field-sizing:content] placeholder:font-normal placeholder:text-muted"
        />

        {media ? (
          <div className="px-4 pb-3">
            <div className="relative overflow-hidden rounded-xl border border-border bg-surface">
              <div className="aspect-video w-full">
                {media.kind === "video" ? (
                  <video src={media.preview} controls playsInline preload="metadata" className="size-full object-contain" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={media.preview} alt="" className="size-full object-contain" />
                )}
              </div>
              {busy ? (
                <div className="absolute inset-0 grid place-items-center bg-background/70">
                  <span className="inline-flex items-center gap-2 rounded-full border border-border bg-elevated px-3 py-1.5 text-[13px]">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Uploading
                  </span>
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => setMedia(null)}
                disabled={busy}
                className="absolute end-2 top-2 inline-flex size-9 cursor-pointer items-center justify-center rounded-full bg-background/90 text-foreground transition-colors duration-200 ease-out hover:bg-background focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
              >
                <X className="size-4" aria-hidden />
                <span className="sr-only">Remove the {media.kind}</span>
              </button>
            </div>
          </div>
        ) : null}

        {showLink ? (
          <div className="px-4 pb-3">
            <div
              className={cn(
                "flex items-center gap-2 rounded-xl border bg-background px-3",
                fieldError === "linkUrl" ? "border-foreground" : "border-border",
              )}
            >
              <Link2 className="size-4 shrink-0 text-muted" aria-hidden />
              <label htmlFor="launch-link" className="sr-only">
                Link
              </label>
              <input
                ref={linkInput}
                id="launch-link"
                name="linkUrl"
                type="url"
                inputMode="url"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://example.com/changelog"
                className="focus-ring-none h-11 min-w-0 flex-1 bg-transparent text-[15px] placeholder:text-muted"
              />
              <button
                type="button"
                onClick={() => {
                  setLink("");
                  setShowLink(false);
                }}
                className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              >
                <X className="size-4" aria-hidden />
                <span className="sr-only">Remove the link</span>
              </button>
            </div>
          </div>
        ) : (
          <input type="hidden" name="linkUrl" value="" />
        )}

        <div className="flex items-center gap-1 border-t border-border px-2 py-1">
          <Tool icon={<ImagePlus className="size-[18px]" aria-hidden />} label="Image" disabled={busy || media !== null} onClick={() => imageInput.current?.click()} />
          <Tool icon={<Video className="size-[18px]" aria-hidden />} label="Video" disabled={busy || media !== null} onClick={() => videoInput.current?.click()} />
          <Tool icon={<Link2 className="size-[18px]" aria-hidden />} label="Link" disabled={showLink} onClick={() => setShowLink(true)} />
          <span
            id="launch-count"
            role={over ? "status" : undefined}
            aria-atomic="true"
            className={cn("ms-auto shrink-0 pe-3 text-[13px] tabular-nums", over ? "font-medium text-foreground" : "text-muted")}
          >
            {over ? `${used - LIMIT} over` : `${used} / ${LIMIT}`}
          </span>
        </div>
      </div>

      <input
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void pick(f, "image");
        }}
      />
      <input
        ref={videoInput}
        type="file"
        accept="video/mp4,video/webm"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void pick(f, "video");
        }}
      />

      <p className="mt-2 text-[13px] text-muted">
        One image or one video, a link, or both. PNG, JPEG or WebP up to 5 MB; MP4 or WebM up to 50 MB.
      </p>

      {/* Where it appears. */}
      {feedChoice ? (
        <fieldset className="mt-6">
          <legend className="text-[15px] font-medium">Where should it appear?</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Choice
              name="audience-choice"
              checked={audience === "page"}
              onChange={() => setAudience("page")}
              icon={<PanelTop className="size-5" aria-hidden />}
              title="Your tool page only"
              detail={`In the updates on ${toolName}.`}
            />
            <Choice
              name="audience-choice"
              checked={audience === "feed"}
              onChange={() => setAudience("feed")}
              icon={<Users className="size-5" aria-hidden />}
              title="Tool page and feed"
              detail="Also posted to Community as a Launch, linked to your tool."
            />
          </div>
        </fieldset>
      ) : null}

      {mediaError || (state.status === "error" && state.message) ? (
        <p role="alert" className="mt-4 flex items-start gap-1.5 text-[14px] text-foreground">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {mediaError ?? state.message}
        </p>
      ) : null}

      <div className="mt-6 flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] leading-relaxed text-muted sm:max-w-[30ch]">
          Goes live straight away. It does not change your listing or need review.
        </p>
        <div className="flex gap-2">
          {onClose ? (
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          ) : (
            <Link
              href={`/developer/tools`}
              className="inline-flex h-11 items-center px-4 text-[15px] font-medium text-muted transition-colors duration-200 ease-out hover:text-foreground"
            >
              Cancel
            </Link>
          )}
          <Button type="submit" disabled={!canLaunch} className="flex-1 sm:flex-none">
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Rocket className="size-4" aria-hidden />
            )}
            {pending ? "Launching" : "Launch"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Tool({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full px-3 text-[14px] font-medium text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted"
    >
      {icon}
      {label}
    </button>
  );
}

/* A radio as a card: the whole card is the target, the dot says which. */
function Choice({
  name,
  checked,
  onChange,
  icon,
  title,
  detail,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <label
      className={cn(
        "relative flex cursor-pointer gap-3 rounded-2xl border p-4 transition-colors duration-200 ease-out has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
        checked ? "border-foreground bg-elevated" : "border-border hover:bg-surface",
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      <span className={cn("mt-0.5 shrink-0", checked ? "text-foreground" : "text-muted")}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">{title}</span>
        <span className="mt-1 block text-[13px] leading-relaxed text-muted">{detail}</span>
      </span>
      <span
        aria-hidden
        className={cn(
          "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border",
          checked ? "border-foreground bg-foreground" : "border-border",
        )}
      >
        {checked ? <span className="size-2 rounded-full bg-accent" /> : null}
      </span>
    </label>
  );
}
