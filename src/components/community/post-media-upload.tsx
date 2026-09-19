"use client";

import { useRef, useState } from "react";
import { ImageUp, Loader2, Trash2, Video } from "lucide-react";
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

type Item = {
  url: string;
  kind: "image" | "video";
  width: number | null;
  height: number | null;
  /* Local only, for the preview and the size line. */
  name: string;
  size: number;
};

export function PostMediaUpload() {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const hasVideo = items.some((i) => i.kind === "video");
  const imageCount = items.filter((i) => i.kind === "image").length;
  const full = hasVideo || imageCount >= MAX_POST_IMAGES;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(e.target.files ?? []);
    if (chosen.length === 0) return;

    setError("");
    setBusy(true);

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
      const added: Item[] = [];

      for (const file of chosen) {
        const isVideo = file.type.startsWith("video/");

        if (hasVideo || added.some((i) => i.kind === "video")) {
          setError("A post carries one video and nothing else.");
          break;
        }
        if (isVideo && (items.length + added.length) > 0) {
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

        const dims = isVideo ? null : await imageSize(file);

        added.push({
          url: publicUrl,
          kind: isVideo ? "video" : "image",
          width: dims?.width ?? null,
          height: dims?.height ?? null,
          name: file.name,
          size: file.size,
        });
      }

      if (added.length > 0) setItems((prev) => [...prev, ...added]);
    } finally {
      setBusy(false);
      /* Let the same file be chosen again after a failure. Without this the
         input holds the old selection and picking it again fires nothing. */
      if (fileRef.current) fileRef.current.value = "";
    }
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

  return (
    <div>
      <p className="mb-1.5 text-[14px] font-medium text-foreground">Photos or video</p>

      {items.length > 0 ? (
        <ul className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {items.map((item) => (
            <li
              key={item.url}
              className="relative overflow-hidden rounded-xl border border-border"
            >
              {item.kind === "image" ? (
                /* A plain img, not next/image: the Supabase host would need
                   allowlisting in next.config, and this follows the precedent
                   the avatar and the tool cards already set. */
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.url}
                  alt=""
                  className="aspect-square w-full bg-surface object-cover"
                />
              ) : (
                <video
                  src={item.url}
                  className="aspect-square w-full bg-surface object-cover"
                  muted
                  playsInline
                />
              )}

              <button
                type="button"
                onClick={() => remove(item.url)}
                /* 44px, and it carries a real name rather than a bare icon. */
                className="absolute end-1 top-1 inline-flex size-11 items-center justify-center rounded-lg bg-background/90 text-muted transition-colors duration-200 ease-out hover:text-foreground"
              >
                <Trash2 className="size-4" aria-hidden />
                <span className="sr-only">Remove {item.name}</span>
              </button>

              {/* The hidden fields the action actually reads. Repeated names,
                  read back with getAll(), so ordering is the DOM order. */}
              <input type="hidden" name="mediaUrl" value={item.url} />
              <input type="hidden" name="mediaKind" value={item.kind} />
              <input type="hidden" name="mediaWidth" value={item.width ?? ""} />
              <input type="hidden" name="mediaHeight" value={item.height ?? ""} />
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy || full}
          className={cn(
            "inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-border px-4 text-[14px]",
            "transition-colors duration-200 ease-out hover:bg-surface",
            "disabled:cursor-default disabled:opacity-50",
          )}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : hasVideo ? (
            <Video className="size-4" aria-hidden />
          ) : (
            <ImageUp className="size-4" aria-hidden />
          )}
          {busy ? "Uploading" : items.length === 0 ? "Add photos or video" : "Add more"}
        </button>

        <p className="text-[13px] text-muted">
          {full
            ? hasVideo
              ? "One video, and nothing else with it."
              : `That is all ${MAX_POST_IMAGES}.`
            : `Up to ${MAX_POST_IMAGES} images (5 MB each), or one video (50 MB).`}
        </p>
      </div>

      <input
        ref={fileRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,video/mp4,video/webm"
        onChange={onPick}
        className="hidden"
        tabIndex={-1}
      />

      {error ? (
        <p role="alert" className="mt-2 text-[13px] text-foreground">
          {error}
        </p>
      ) : null}

      {/* Announced only while it is happening, so nothing is read on load. */}
      {busy ? (
        <p role="status" className="sr-only">
          Uploading
        </p>
      ) : null}
    </div>
  );
}

/*
  The natural size of an image, so the card can reserve the right box and the
  feed does not jump as pictures load. Resolves to null rather than throwing:
  a missing dimension costs a reserved box, not a failed post.
*/
function imageSize(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
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
