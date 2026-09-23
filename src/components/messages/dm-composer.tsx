"use client";

import { useActionState, useEffect, useOptimistic, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  ArrowUp,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  Mic,
  Paperclip,
  Square,
  Trash2,
  Video,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { sendMessage, type SendState } from "@/app/actions/messages";
import {
  classifyAttachment,
  cleanFileName,
  DM_BUCKET,
  DM_FILE_TYPES,
  DM_FILES_BUCKET,
  DM_IMAGES_BUCKET,
  matchesSignature,
  maxBytesFor,
  MAX_DM_MEDIA_BYTES,
  MAX_VOICE_SECONDS,
  VOICE_TYPES,
  voiceExtension,
} from "@/lib/messages/shared";
import { formatBytes } from "@/lib/format";

/*
  The composer, redesigned from the founder's reference (4BA): a paperclip in a
  circle, then one pill holding the text and, at its end, the microphone. The
  microphone becomes the send button the moment there is something to send,
  as WhatsApp, Instagram and TikTok do it.

  THE KINDS: text, a voice note, and through the paperclip a photo (JPG, PNG,
  WebP, 5 MB, dm-images), a video (MP4, WebM, 25 MB, dm-media) or a TXT or CSV
  file (1 MB, dm-files) (4BB). Each bucket refuses any other type or size at the
  storage server. The separate link control is gone: a link typed into the text
  is a link (the row makes it clickable).

  ATTACHMENTS GO STRAIGHT FROM THE BROWSER TO STORAGE under the person's own
  session, to <thread>/<sender>/<random uuid>.<ext>, and only that PATH is
  posted to the action. The checks here refuse a wrong file before the upload, for the
  person's sake. They are not the control: the bucket's type and size limits,
  the storage policy, sendMessage's byte check and dm_messages_file_ok are.
*/

type Attachment =
  | { kind: "voice"; path: string; label: string; durationSeconds: number }
  | { kind: "file"; path: string; label: string; fileName: string; size: number }
  | { kind: "image" | "video"; path: string; label: string; size: number };

/* The first bytes of a picked file, looked at for binary content so a renamed
   image or program is refused at once. The server repeats this on every byte. */
async function looksLikePlainText(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
  for (const b of head) {
    if ((b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) || b === 0x7f) return false;
  }
  return true;
}

export function DmComposer({ threadId }: { threadId: string }) {
  /* Built here, not imported: a "use server" module exports async functions
     only, so an imported initial state arrives undefined. */
  const [state, action] = useActionState<SendState, FormData>(sendMessage, {
    status: "idle",
    message: "",
    body: "",
    attempt: 0,
  });

  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  /* Whether the field has text, which is what swaps the microphone for send. */
  const [hasText, setHasText] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  /*
    SENT BEFORE THE SERVER ANSWERS (4AZ). The bubble shows at once, marked
    Sending, and the box clears. useOptimistic holds it for as long as the
    send's transition runs, which ends with the revalidated thread carrying the
    real message. A refused send drops it and the form, keyed on the attempt,
    restores what was typed from state.body.
  */
  const [pendingBodies, addPending] = useOptimistic<string[], string>(
    [],
    (current, body) => [...current, body],
  );

  /*
    After each attempt: a success clears the attachment; a refusal restores the
    typed text (the form remounts with it), so the send button must reflect it.
    Adjusted during render, not in an effect, so the stale state never paints.
  */
  const [seenAttempt, setSeenAttempt] = useState(state.attempt);
  if (state.attempt !== seenAttempt) {
    setSeenAttempt(state.attempt);
    setHasText(state.body.trim().length > 0);
    if (state.status === "idle") {
      setAttachment(null);
      setError("");
    }
  }

  async function uploadVoice(blob: Blob, seconds: number) {
    setError("");
    if (blob.size === 0) {
      setError("That recording came out empty.");
      return;
    }
    if (blob.size > MAX_DM_MEDIA_BYTES) {
      setError(`That recording is ${formatBytes(blob.size)}, over the 10 MB limit.`);
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

      const path = `${threadId}/${user.id}/${crypto.randomUUID()}.${voiceExtension(blob.type)}`;
      const { error: upErr } = await supabase.storage
        .from(DM_BUCKET)
        .upload(path, blob, { contentType: blob.type, upsert: false });
      if (upErr) {
        console.error("[dm] voice upload failed", upErr.message);
        setError("That did not upload. Check your connection and try again.");
        return;
      }
      setAttachment({ kind: "voice", path, label: "Voice message", durationSeconds: seconds });
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setError("");

    /*
      Photos, videos and text files (4BB). Sorted by extension, then refused here
      if too big or if the first bytes do not match the type, so a wrong file
      never uploads. The same checks run again on the server; these are for the
      person, the server's are the control.
    */
    const type = classifyAttachment(file.name);
    if (!type) {
      setError("You can send photos (JPG, PNG, WebP), videos (MP4, WebM) and .txt or .csv files.");
      return;
    }
    if (file.size === 0) {
      setError("That file is empty.");
      return;
    }
    const limit = maxBytesFor(type.kind);
    if (file.size > limit) {
      setError(`That is ${formatBytes(file.size)}. The limit is ${formatBytes(limit)}.`);
      return;
    }

    let cleanedName: string | null = null;
    if (type.kind === "file") {
      const cleaned = cleanFileName(file.name);
      if (!cleaned) {
        setError("Only .txt and .csv files can be sent.");
        return;
      }
      if (!(await looksLikePlainText(file))) {
        setError("That is not a plain text file, so it cannot be sent.");
        return;
      }
      cleanedName = cleaned.name;
    } else {
      const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
      if (!matchesSignature(type.ext, head)) {
        setError("That file is not what its name says, so it cannot be sent.");
        return;
      }
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

      /* A random name in storage. What the person called it is never a path. */
      const path = `${threadId}/${user.id}/${crypto.randomUUID()}.${type.ext}`;
      const bucket =
        type.kind === "image" ? DM_IMAGES_BUCKET : type.kind === "video" ? DM_BUCKET : DM_FILES_BUCKET;
      const contentType = type.kind === "file" ? DM_FILE_TYPES[type.ext as "txt" | "csv"] : type.mime;

      const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(path, file, { contentType, upsert: false });
      if (upErr) {
        console.error("[dm] attachment upload failed", upErr.message);
        setError("That did not upload. You may have reached today's limit.");
        return;
      }

      if (type.kind === "file" && cleanedName) {
        setAttachment({ kind: "file", path, label: cleanedName, fileName: cleanedName, size: file.size });
      } else if (type.kind === "image" || type.kind === "video") {
        setAttachment({
          kind: type.kind,
          path,
          label: type.kind === "image" ? "Photo" : "Video",
          size: file.size,
        });
      }
    } finally {
      setBusy(false);
    }
  }

  const kind: "text" | "voice" | "file" | "image" | "video" = attachment ? attachment.kind : "text";
  const canSend = hasText || Boolean(attachment);

  function submit(formData: FormData) {
    const text = String(formData.get("body") ?? "").trim();
    if (text && kind === "text") addPending(text);
    if (bodyRef.current) bodyRef.current.value = "";
    setHasText(false);
    action(formData);
  }

  return (
    <div className="bg-background px-3 pb-3 pt-2 sm:px-4">
      {pendingBodies.length > 0 ? (
        <ol className="mb-2 flex flex-col items-end gap-1.5" aria-live="polite">
          {pendingBodies.map((body, i) => (
            <li
              key={i}
              className="max-w-[80%] whitespace-pre-wrap break-words rounded-[20px] bg-primary px-3.5 py-2.5 text-[15px] leading-relaxed text-on-primary opacity-70 sm:max-w-[72%]"
            >
              {body}
              <span className="sr-only"> Sending</span>
            </li>
          ))}
        </ol>
      ) : null}

      {attachment || busy ? (
        <div className="mb-2 ms-14 flex items-center gap-2 rounded-2xl border border-border bg-elevated px-3 py-2">
          {busy ? (
            <LoaderCircle className="size-4 shrink-0 animate-spin text-muted" aria-hidden />
          ) : attachment?.kind === "voice" ? (
            <Mic className="size-4 shrink-0 text-muted" aria-hidden />
          ) : attachment?.kind === "image" ? (
            <ImageIcon className="size-4 shrink-0 text-muted" aria-hidden />
          ) : attachment?.kind === "video" ? (
            <Video className="size-4 shrink-0 text-muted" aria-hidden />
          ) : (
            <FileText className="size-4 shrink-0 text-muted" aria-hidden />
          )}
          <span className="min-w-0 flex-1 truncate text-[14px]" role="status">
            {busy
              ? "Uploading"
              : attachment?.kind === "voice"
                ? `${attachment.label} · ${formatDuration(attachment.durationSeconds)}`
                : attachment
                  ? `${attachment.label} · ${formatBytes(attachment.size)}`
                  : null}
          </span>
          {attachment && !busy ? (
            <button
              type="button"
              onClick={() => setAttachment(null)}
              className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
            >
              <Trash2 className="size-4" aria-hidden />
              <span className="sr-only">Remove attachment</span>
            </button>
          ) : null}
        </div>
      ) : null}

      <form ref={formRef} action={submit} key={state.attempt} className="flex items-end gap-2">
        <input type="hidden" name="threadId" value={threadId} />
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="mediaPath" value={attachment?.path ?? ""} />
        <input
          type="hidden"
          name="durationSeconds"
          value={attachment?.kind === "voice" ? attachment.durationSeconds : ""}
        />
        <input
          type="hidden"
          name="fileName"
          value={attachment?.kind === "file" ? attachment.fileName : ""}
        />

        {/* The paperclip, in its own circle: photos, videos, TXT and CSV (4BB). */}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy || Boolean(attachment)}
          title="Attach a photo, video or text file"
          className="inline-flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-elevated text-foreground transition-colors duration-200 ease-out hover:bg-surface disabled:cursor-default disabled:opacity-40"
        >
          <Paperclip className="size-5" aria-hidden />
          <span className="sr-only">Attach a photo, video, or .txt or .csv file</span>
        </button>

        {/* The pill: the text, and the microphone or send at its end. */}
        <div className="flex min-h-12 min-w-0 flex-1 items-end gap-1 rounded-[24px] border border-border bg-elevated py-1.5 pe-1.5 ps-4 transition-colors duration-200 focus-within:border-foreground">
          <label htmlFor="dm-body" className="sr-only">
            Message
          </label>
          <textarea
            ref={bodyRef}
            id="dm-body"
            name="body"
            rows={1}
            defaultValue={state.body}
            onInput={(e) => setHasText(e.currentTarget.value.trim().length > 0)}
            onKeyDown={(e) => {
              /* Enter sends and Shift and Enter is a new line, as on WhatsApp
                 Web. A held key repeats and Enter confirming an IME composition
                 is not a send, so neither fires one. */
              if (e.key !== "Enter" || e.shiftKey) return;
              e.preventDefault();
              if (e.repeat || e.nativeEvent.isComposing || !canSend || busy) return;
              formRef.current?.requestSubmit();
            }}
            placeholder={attachment ? "Add a note, or send" : "Send a message"}
            /* focus-ring-none: the pill's border is the focus indicator.
               16px below sm or iOS zooms the page (D91). field-sizing grows the
               field with its text up to max-h, where it scrolls. */
            className="focus-ring-none max-h-32 min-h-9 w-full flex-1 resize-none bg-transparent py-1.5 text-[16px] leading-6 text-foreground [field-sizing:content] placeholder:text-muted sm:text-[15px]"
          />

          {canSend ? (
            <SendButton busy={busy} />
          ) : (
            <Recorder disabled={busy} onRecorded={uploadVoice} onError={setError} />
          )}
        </div>
      </form>

      <input
        ref={fileRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.mp4,.webm,.txt,.csv,image/jpeg,image/png,image/webp,video/mp4,video/webm,text/plain,text/csv"
        onChange={onFile}
        className="hidden"
        tabIndex={-1}
      />

      {/* role=alert, because the ux guidance rates a visual only error High.
          Rendered only when there is one, so nothing is announced on load. */}
      {error || (state.status === "error" && state.message) ? (
        <p role="alert" className="ms-14 mt-2 text-[13px] text-foreground">
          {error || state.message}
        </p>
      ) : null}
    </div>
  );
}

function SendButton({ busy }: { busy: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || busy}
      className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary text-on-primary transition-colors duration-200 ease-out hover:bg-primary-hover disabled:opacity-60"
    >
      <ArrowUp className="size-[18px]" aria-hidden />
      <span className="sr-only">{pending ? "Sending" : "Send"}</span>
    </button>
  );
}

/*
  The voice recorder.

  MediaRecorder gives a different container per browser: Chrome and Firefox
  produce audio/webm with Opus, Safari produces audio/mp4 with AAC and cannot
  do webm at all. VOICE_TYPES is tried in order and the first supported one
  wins, so recording works on all three rather than silently failing on one.

  The microphone track is STOPPED in a finally, not only on the happy path. A
  getUserMedia stream that is not stopped leaves the browser's recording
  indicator lit, which looks exactly like an app still listening to you.

  No browser dialogs anywhere: a denied permission is caught and reported in
  the page, because a native dialog would block every later event.
*/
function Recorder({
  disabled,
  onRecorded,
  onError,
}: {
  disabled: boolean;
  onRecorded: (blob: Blob, seconds: number) => void;
  onError: (message: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startedRef = useRef(0);

  /* The visible timer. An interval rather than a rAF loop: this updates once a
     second and does not need a frame. */
  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedRef.current) / 1000);
      setSeconds(elapsed);
      if (elapsed >= MAX_VOICE_SECONDS) recorderRef.current?.stop();
    }, 1000);
    return () => window.clearInterval(id);
  }, [recording]);

  /* If this component goes away mid recording, the microphone still has to be
     released. */
  useEffect(() => {
    return () => {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function start() {
    onError("");

    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices) {
      onError("This browser cannot record audio. Send text instead.");
      return;
    }

    const type = VOICE_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    if (!type) {
      onError("This browser cannot record audio in a format Celpare accepts.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      /* Denied, dismissed, or no microphone. All three are the same answer to
         the person: it did not start, and here is why it might not have. */
      onError("Celpare could not use the microphone. Check the site permission.");
      return;
    }

    streamRef.current = stream;
    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(stream, { mimeType: type });
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      const elapsed = Math.max(1, Math.round((Date.now() - startedRef.current) / 1000));
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      recorderRef.current = null;
      setRecording(false);
      setSeconds(0);
      onRecorded(new Blob(chunks, { type }), elapsed);
    };

    startedRef.current = Date.now();
    setSeconds(0);
    setRecording(true);
    recorder.start();
  }

  function stop() {
    recorderRef.current?.stop();
  }

  if (recording) {
    return (
      <button
        type="button"
        onClick={stop}
        className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-full bg-primary px-3 text-[14px] font-medium text-on-primary"
      >
        <Square className="size-3.5 fill-current" aria-hidden />
        <span className="tabular-nums">{formatDuration(seconds)}</span>
        <span className="sr-only">Stop recording and attach</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={disabled}
      title="Record a voice message"
      className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-foreground transition-colors duration-200 ease-out hover:bg-surface disabled:cursor-default disabled:opacity-40"
    >
      <Mic className="size-5" aria-hidden />
      <span className="sr-only">Record a voice message</span>
    </button>
  );
}

function formatDuration(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
