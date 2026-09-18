"use client";

import { useId, useRef, useState } from "react";
import { ImageUp, Loader2, Trash2, Video } from "lucide-react";
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
  type MediaKind,
} from "@/lib/tools/media";
import { cn } from "@/lib/utils";

/*
  One uploaded file: the logo, the cover, a screenshot or a video.

  IT UPLOADS FROM THE BROWSER, STRAIGHT TO SUPABASE STORAGE, and that is not a
  shortcut. A server action cannot carry these: Vercel caps a serverless
  request body at 4.5 MB, so a 50 MB video could never pass through one however
  the Next config is set. The upload uses the person's own session, so the
  storage policy applies exactly as it would to any other client call.

  WHAT STOPS A BAD FILE, in the order it is checked:

    1. Here, before anything is sent: the MAGIC BYTES, read from the file
       itself. A browser sends whatever Content-Type it likes. This is a
       courtesy so nobody waits out a long upload to be told no, and it is
       NOT the control.
    2. The bucket: its own size cap and MIME allowlist, enforced by storage, so
       it holds for a direct API call that never loaded this page.
    3. The storage policy: the first path segment has to be the caller's user
       id, so nobody writes into somebody else's folder.
    4. submitTool, at the end: it re-reads the first bytes of every file out of
       the bucket and sniffs them again, and refuses any URL that is not an
       upload of the caller's own. That one is the control.

  The value travels in a hidden input, so the surrounding form stays an
  ordinary uncontrolled form and the action still receives a URL exactly as it
  did when these were typed in by hand.
*/

type Props = {
  name: string;
  kind: "image" | "video";
  label: string;
  hint?: string;
  defaultValue?: string;
  invalid?: boolean;
  /* Square preview for a logo, wide for a cover or screenshot. */
  shape?: "square" | "wide";
  onRemoveRow?: () => void;
  removeRowLabel?: string;
};

export function MediaUpload({
  name,
  kind,
  label,
  hint,
  defaultValue = "",
  invalid,
  shape = "wide",
  onRemoveRow,
  removeRowLabel,
}: Props) {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(defaultValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isVideo = kind === "video";
  const bucket = isVideo ? VIDEO_BUCKET : IMAGE_BUCKET;
  const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  const accept = isVideo ? "video/mp4,video/webm" : "image/png,image/jpeg,image/webp";

  async function pick(file: File) {
    setError(null);

    if (file.size === 0) {
      setError("That file is empty.");
      return;
    }
    if (file.size > maxBytes) {
      setError(
        isVideo
          ? "That video is over 50 MB. Compress it, or link it on the profile instead."
          : "That image is over 5 MB. Try a smaller one.",
      );
      return;
    }

    /* Read only the leading bytes. Slicing first means a 50 MB video is not
       pulled into memory to look at twelve of them. */
    const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
    const sniffed: MediaKind | null = isVideo ? sniffVideo(head) : sniffImage(head);

    if (!sniffed) {
      /* Deliberately does not repeat the type the file claimed. The point is
         that we did not believe it. */
      setError(
        isVideo
          ? "That file is not an MP4 or WebM video."
          : "That file is not a PNG, JPEG or WebP image.",
      );
      return;
    }

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

      /*
        A fresh name every time rather than a fixed one. Overwriting a path
        would serve the stale file for as long as the CDN cached it, which on
        something somebody just changed is the one thing they notice.
      */
      const path = `${user.id}/${crypto.randomUUID()}.${sniffed}`;

      const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(path, file, { contentType: CONTENT_TYPE[sniffed], upsert: false });

      if (upErr) {
        console.error("[media] upload failed", upErr.message);
        setError("That did not upload. Check your connection and try again.");
        return;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from(bucket).getPublicUrl(path);

      setUrl(publicUrl);
    } finally {
      setBusy(false);
      /* Let the same file be chosen again after a failure. Without this the
         input holds the old selection and picking it again fires nothing. */
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  /*
    Clearing forgets the URL and leaves the file in the bucket.

    Deleting it here would be wrong: the same URL may already be saved on a
    draft, and a person who clears a field and then presses Back should not
    find the picture gone from a submission they never changed. Files uploaded
    and never submitted are orphans, which is a cleanup job rather than a
    broken page. Logged with the avatars one, G41.
  */
  function clear() {
    setUrl("");
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={inputId} className="block text-[14px] font-medium text-foreground">
          {label}
        </label>
        {onRemoveRow ? (
          <button
            type="button"
            onClick={onRemoveRow}
            aria-label={removeRowLabel}
            className="shrink-0 cursor-pointer text-[13px] text-muted transition-colors duration-200 ease-out hover:text-foreground"
          >
            Remove
          </button>
        ) : null}
      </div>

      <input type="hidden" name={name} value={url} />

      <div
        className={cn(
          "flex items-center gap-4 rounded-xl border border-border p-3",
          (invalid || error) && "border-foreground",
        )}
      >
        <div
          className={cn(
            "flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface",
            shape === "square" ? "h-16 w-16" : "h-16 w-28",
          )}
        >
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted" aria-hidden />
          ) : url && !isVideo ? (
            /* A plain img, following the monogram in tool-cards.tsx, so no
               remote host needs allowlisting in next.config. */
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="h-full w-full object-cover" />
          ) : url && isVideo ? (
            <Video className="h-5 w-5 text-foreground" aria-hidden />
          ) : isVideo ? (
            <Video className="h-5 w-5 text-muted" aria-hidden />
          ) : (
            <ImageUp className="h-5 w-5 text-muted" aria-hidden />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <input
            ref={fileRef}
            id={inputId}
            type="file"
            accept={accept}
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void pick(f);
            }}
            className="block w-full text-[13px] text-muted file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-border file:bg-transparent file:px-3 file:py-1.5 file:text-[13px] file:text-foreground hover:file:bg-surface disabled:opacity-50"
          />
          <p className="mt-1.5 text-[12px] text-muted">
            {busy
              ? "Uploading..."
              : url
                ? "Uploaded."
                : isVideo
                  ? "MP4 or WebM, up to 50 MB."
                  : "PNG, JPEG or WebP, up to 5 MB."}
          </p>
        </div>

        {url && !busy ? (
          <button
            type="button"
            onClick={clear}
            aria-label={`Clear ${label}`}
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border text-muted transition-colors duration-200 ease-out hover:text-foreground"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-1.5 text-[13px] text-foreground">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[13px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
