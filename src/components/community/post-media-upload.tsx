"use client";

import { useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  CONTENT_TYPE,
  SNIFF_BYTES,
  sniffImage,
  sniffVideo,
  type MediaKind,
} from "@/lib/tools/media";
import {
  MAX_POST_IMAGES,
  MAX_POST_IMAGE_BYTES,
  MAX_POST_VIDEO_BYTES,
  POST_IMAGE_BUCKET,
  POST_VIDEO_BUCKET,
} from "@/lib/community/media";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

/*
  Images and video on a post. Up to four images, OR one video and nothing else.

  Split into a hook and a grid (2026-10-01) so the composer card can put the
  previews inside the writing area and the buttons in its toolbar. The upload
  logic and the checks below are unchanged.

  WHY THIS IS NOT MediaUpload. That component is one file in one hidden input,
  shaped around a tool listing's logo, cover and screenshot being separate
  named fields. A post has a LIST, the order matters, and the two kinds are
  mutually exclusive. The security doctrine is copied exactly; the shape is
  not.

  IT UPLOADS FROM THE BROWSER, STRAIGHT TO SUPABASE STORAGE, for the same
  reason MediaUpload does: Vercel caps a serverless request body at 4.5 MB, so
  a 50 MB video could never pass through a server action however the Next
  config is set. The upload uses the person's own session, so the storage
  policy applies exactly as it would to any other client call.

  WHAT STOPS A BAD FILE, in the order it is checked:

    1. Here, before anything is sent: the MAGIC BYTES, read from the file
       itself. A browser sends whatever Content-Type it likes. This is a
       courtesy so nobody waits out a 50 MB upload to be told no, and it is
       NOT the control.
    2. The bucket: its own size cap and MIME allowlist, enforced by storage,
       so it holds for a direct API call that never loaded this page.
    3. The storage policy: the first path segment has to be the caller's user
       id, so nobody writes into somebody else's folder.
    4. tg_post_media_cap, in the database: four images, or one video alone.
    5. createPost, at the end: every URL is checked with isOwnPostUpload, which
       refuses anything that is not an upload of the caller's own into a POST
       bucket. That one, with the trigger, is the control.

  The list travels as repeated hidden inputs, so the surrounding form stays an
  ordinary uncontrolled form and the action reads them with getAll().
*/

export type MediaItem = {
  url: string;
  kind: "image" | "video";
  width: number | null;
  height: number | null;
  /* Videos only: the length the browser read from the file (4BG). The
     server clamps it and the player's own reports correct it later. */
  durationMs: number | null;
  /* Local only, for the remove button's name. */
  name: string;
  size: number;
};

/* A file chosen but not uploaded yet, drawn as a placeholder tile. */
type Pending = { id: string; name: string };

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp";
const VIDEO_ACCEPT = "video/mp4,video/webm";

export function usePostMedia() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [error, setError] = useState("");
  const imageRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  const busy = pending.length > 0;
  const hasVideo = items.some((i) => i.kind === "video");
  const imageCount = items.filter((i) => i.kind === "image").length;
  /* The buttons are disabled rather than left to fail: a video button that
     only ever answers "one video and nothing else" is a trap. */
  const canAddImage = !busy && !hasVideo && imageCount < MAX_POST_IMAGES;
  const canAddVideo = !busy && items.length === 0;

  /* One path for the pickers, a drop and a paste. */
  async function addFiles(chosen: File[]) {
    if (chosen.length === 0 || busy) return;

    setError("");
    const queue = chosen.map((file) => ({ file, id: crypto.randomUUID() }));
    setPending(queue.map(({ id, file }) => ({ id, name: file.name })));

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("Your session has expired. Reload the page and sign in again.");
        return;
      }

      /* Accumulated locally rather than read back from state inside the loop,
         because setState is not synchronous and the second file of a batch
         would otherwise be checked against the count before the first. */
      const added: MediaItem[] = [];

      for (const { file, id } of queue) {
        const isVideo = file.type.startsWith("video/");

        if (hasVideo || added.some((i) => i.kind === "video")) {
          setError("A post carries one video and nothing else.");
          break;
        }
        if (isVideo && items.length + added.length > 0) {
          setError("A post carries one video and nothing else.");
          break;
        }
        if (!isVideo && imageCount + added.length >= MAX_POST_IMAGES) {
          setError(`A post carries up to ${MAX_POST_IMAGES} images.`);
          break;
        }

        if (file.size === 0) {
          setError(`${file.name} is empty.`);
          break;
        }

        const maxBytes = isVideo ? MAX_POST_VIDEO_BYTES : MAX_POST_IMAGE_BYTES;
        if (file.size > maxBytes) {
          setError(
            isVideo
              ? `That video is ${formatBytes(file.size)}, over the 50 MB limit. Compress it, or link it instead.`
              : `${file.name} is ${formatBytes(file.size)}, over the 5 MB limit.`,
          );
          break;
        }

        /* Only the leading bytes, so a 50 MB video is not pulled into memory
           to look at twelve of them. */
        const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
        const sniffed: MediaKind | null = isVideo ? sniffVideo(head) : sniffImage(head);

        if (!sniffed) {
          /* Deliberately does not repeat the type the file claimed. The point
             is that we did not believe it. */
          setError(
            isVideo
              ? "That file is not an MP4 or WebM video."
              : `${file.name} is not a PNG, JPEG or WebP image.`,
          );
          break;
        }

        const bucket = isVideo ? POST_VIDEO_BUCKET : POST_IMAGE_BUCKET;
        /* A fresh name every time. Overwriting a path would serve the stale
           file for as long as the CDN cached it. */
        const path = `${user.id}/${crypto.randomUUID()}.${sniffed}`;

        const { error: upErr } = await supabase.storage
          .from(bucket)
          .upload(path, file, { contentType: CONTENT_TYPE[sniffed], upsert: false });

        if (upErr) {
          console.error("[post media] upload failed", upErr.message);
          setError("That did not upload. Check your connection and try again.");
          break;
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from(bucket).getPublicUrl(path);

        const dims = isVideo ? await videoMeta(file) : await imageSize(file);

        const item: MediaItem = {
          url: publicUrl,
          kind: isVideo ? "video" : "image",
          /* || rather than ??: a video that reports 0 has no known size, and
             the action's schema refuses a width of 0. */
          width: dims?.width || null,
          height: dims?.height || null,
          durationMs: dims && "durationMs" in dims ? (dims.durationMs as number | null) : null,
          name: file.name,
          size: file.size,
        };
        added.push(item);

        /* Shown as each one lands, so a batch of four fills in one by one
           rather than appearing all at once at the end. */
        setItems((prev) => [...prev, item]);
        setPending((prev) => prev.filter((p) => p.id !== id));
      }
    } finally {
      setPending([]);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    /* Let the same file be chosen again after a failure. Without this the
       input holds the old selection and picking it again fires nothing. */
    e.target.value = "";
    void addFiles(files);
  }

  /*
    Removing forgets the URL and leaves the file in the bucket, which is what
    MediaUpload does and for the same reason: the upload is already the
    caller's own, and a delete here would be a second failure path on a page
    somebody is in the middle of. An orphan is cheap; a half deleted post is
    not. Cleaning orphans is a retention job and is recorded as a gap.
  */
  function remove(url: string) {
    setItems((prev) => prev.filter((i) => i.url !== url));
    setError("");
  }

  const inputs = (
    <>
      <input
        ref={imageRef}
        type="file"
        multiple
        accept={IMAGE_ACCEPT}
        onChange={onPick}
        className="hidden"
        tabIndex={-1}
      />
      <input
        ref={videoRef}
        type="file"
        accept={VIDEO_ACCEPT}
        onChange={onPick}
        className="hidden"
        tabIndex={-1}
      />
    </>
  );

  return {
    items,
    pending,
    error,
    busy,
    hasVideo,
    imageCount,
    canAddImage,
    canAddVideo,
    addFiles,
    remove,
    pickImages: () => imageRef.current?.click(),
    pickVideo: () => videoRef.current?.click(),
    inputs,
  };
}

/*
  The previews, inside the composer card. One item shows at its own shape; two
  to four sit in a two column grid, the first spanning the row when there are
  three, the way a finished post lays them out.
*/
export function MediaGrid({
  items,
  pending,
  onRemove,
}: {
  items: MediaItem[];
  pending: Pending[];
  onRemove: (url: string) => void;
}) {
  const total = items.length + pending.length;
  if (total === 0) return null;

  const single = total === 1;
  const tile = (index: number) =>
    cn(
      "relative overflow-hidden rounded-xl border border-border bg-surface",
      !single && "aspect-[4/3]",
      total === 3 && index === 0 && "col-span-2 aspect-[2/1]",
    );

  return (
    <ul className={cn("grid gap-2", single ? "grid-cols-1" : "grid-cols-2")}>
      {items.map((item, index) => (
        <li key={item.url} className={tile(index)}>
          {item.kind === "image" ? (
            /* A plain img, not next/image: the Supabase host would need
               allowlisting in next.config, and this follows the precedent
               the avatar and the tool cards already set. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.url}
              alt=""
              className={cn(
                "w-full",
                single ? "max-h-[440px] object-contain" : "h-full object-cover",
              )}
            />
          ) : (
            /* Click to play, never autoplay (ui-ux-pro-max: auto-play video). */
            <video
              src={item.url}
              controls
              preload="metadata"
              playsInline
              className={cn(
                "w-full bg-black",
                single ? "aspect-video object-contain" : "h-full object-cover",
              )}
            />
          )}

          <button
            type="button"
            onClick={() => onRemove(item.url)}
            /* A 44px target around a 32px mark, with a real name. */
            className="group/remove absolute end-1 top-1 grid size-11 cursor-pointer place-items-center rounded-full"
          >
            <span className="grid size-8 place-items-center rounded-full bg-black/60 text-white transition-colors duration-200 ease-out group-hover/remove:bg-black/80">
              <X className="size-4" aria-hidden />
            </span>
            <span className="sr-only">Remove {item.name}</span>
          </button>

          {/* The hidden fields the action actually reads. Repeated names,
              read back with getAll(), so ordering is the DOM order. */}
          <input type="hidden" name="mediaUrl" value={item.url} />
          <input type="hidden" name="mediaKind" value={item.kind} />
          <input type="hidden" name="mediaWidth" value={item.width ?? ""} />
          <input type="hidden" name="mediaHeight" value={item.height ?? ""} />
          <input type="hidden" name="mediaDuration" value={item.durationMs ?? ""} />
        </li>
      ))}

      {pending.map((p, i) => (
        <li
          key={p.id}
          className={cn(
            tile(items.length + i),
            single && "aspect-video",
            "grid place-items-center",
          )}
        >
          <div className="flex max-w-[80%] flex-col items-center gap-2 text-center">
            <Loader2 className="size-5 animate-spin text-muted" aria-hidden />
            <span className="max-w-full truncate text-[13px] text-muted">{p.name}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/*
  createObjectURL always returns blob:<origin>/<id>, made by the browser. Checked
  anyway so a media element's src can only ever be that, which also keeps the
  CodeQL DOM to HTML rule (js/xss-through-dom) satisfied.
*/
export function isBlobUrl(url: string): boolean {
  return url.startsWith(`blob:${window.location.origin}/`);
}

/*
  A video's size and length from its metadata, read locally before the post is
  written, so distribution knows how long "finished watching" is. Null after
  five seconds or on any error: a missing length costs nothing but precision.
*/
export function videoMeta(file: File): Promise<{ width: number; height: number; durationMs: number | null } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    // Only a browser made blob: URL ever reaches src, never text from the page.
    if (!isBlobUrl(url)) {
      URL.revokeObjectURL(url);
      resolve(null);
      return;
    }
    const video = document.createElement("video");
    let done = false;
    const finish = (value: { width: number; height: number; durationMs: number | null } | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), 5000);
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () =>
      finish({
        width: video.videoWidth || 0,
        height: video.videoHeight || 0,
        durationMs: Number.isFinite(video.duration) && video.duration > 0 ? Math.round(video.duration * 1000) : null,
      });
    video.onerror = () => finish(null);
    video.src = url;
  });
}

/*
  The natural size of an image, so the card can reserve the right box and the
  feed does not jump as pictures load. Resolves to null rather than throwing:
  a missing dimension costs a reserved box, not a failed post.
*/
export function imageSize(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    if (!isBlobUrl(url)) {
      URL.revokeObjectURL(url);
      resolve(null);
      return;
    }
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}
