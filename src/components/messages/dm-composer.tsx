"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Link2, Mic, Paperclip, Send, Square, Trash2, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { sendMessage, type SendState } from "@/app/actions/messages";
import {
  DM_BUCKET,
  MAX_DM_MEDIA_BYTES,
  MAX_VOICE_SECONDS,
  VOICE_TYPES,
  voiceExtension,
} from "@/lib/messages/shared";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

/*
  The composer. Four kinds: text, a link, a voice note, a video.

  MEDIA GOES STRAIGHT FROM THE BROWSER TO STORAGE, never through the server
  action. Vercel caps a serverless request body at 4.5 MB, so a 50 MB video
  could not pass through one however Next is configured. The upload uses the
  person's own session, so the storage policy applies exactly as it would to
  any other client call, and only the resulting PATH is posted to the action.

  THE PATH IS <thread>/<sender>/<uuid>.<ext> AND THAT SHAPE IS LOAD BEARING.
  The storage policy checks segment one against thread membership and segment
  two against auth.uid(), and sendMessage checks the same prefix again before
  writing the row. Neither trusts this component, which is right: it is a
  client component and can be bypassed entirely.

  WHY THE KIND IS A HIDDEN FIELD RATHER THAN A CHOICE. Nobody picks "this is a
  voice message": they press record, or they attach a file, and the kind
  follows from what they did. A picker would be a fifth control that can
  disagree with the other four, which is the dishonesty dm_messages_shape_ok
  refuses at the database.
*/

type Attachment = {
  path: string;
  kind: "voice" | "video";
  label: string;
  durationSeconds: number | null;
};

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
  const [linkOpen, setLinkOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /*
    A successful send clears the attachment and the link field as well as the
    text. The action reports success by returning status idle on a new attempt.

    ADJUSTED DURING RENDER, NOT IN AN EFFECT. The obvious version is a
    useEffect watching state.attempt, and it is what react-hooks/set-state-in-
    effect flags: it renders the stale attachment once, then re-renders, so the
    just-sent voice note visibly flashes back before disappearing. Comparing
    against the previous attempt during render is React's documented way to
    adjust state when an input changes, and it never paints the stale value.
  */
  const [seenAttempt, setSeenAttempt] = useState(state.attempt);
  if (state.attempt !== seenAttempt) {
    setSeenAttempt(state.attempt);
    if (state.status === "idle") {
      setAttachment(null);
      setLinkOpen(false);
      setError("");
    }
  }

  async function upload(blob: Blob, kind: "voice" | "video", filename: string, seconds: number | null) {
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

      if (blob.size === 0) {
        setError("That recording came out empty.");
        return;
      }
      if (blob.size > MAX_DM_MEDIA_BYTES) {
        setError(`That is ${formatBytes(blob.size)}, over the 50 MB limit.`);
        return;
      }

      const path = `${threadId}/${user.id}/${crypto.randomUUID()}.${filename}`;

      const { error: upErr } = await supabase.storage
        .from(DM_BUCKET)
        .upload(path, blob, { contentType: blob.type, upsert: false });

      if (upErr) {
        console.error("[dm] upload failed", upErr.message);
        setError("That did not upload. Check your connection and try again.");
        return;
      }

      setAttachment({
        path,
        kind,
        label: kind === "voice" ? "Voice message" : "Video",
        durationSeconds: seconds,
      });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setError("Pick an MP4 or WebM video.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    const ext = file.type.includes("webm") ? "webm" : "mp4";
    await upload(file, "video", ext, null);
  }

  const kind: "text" | "link" | "voice" | "video" = attachment
    ? attachment.kind
    : linkOpen
      ? "link"
      : "text";

  return (
    <div className="border-t border-border bg-background px-3 py-3 sm:px-4">
      {attachment ? (
        <div className="mb-2 flex items-center gap-2 rounded-xl border border-border px-3 py-2">
          {attachment.kind === "voice" ? (
            <Mic className="size-4 shrink-0 text-muted" aria-hidden />
          ) : (
            <Video className="size-4 shrink-0 text-muted" aria-hidden />
          )}
          <span className="min-w-0 flex-1 truncate text-[14px]">
            {attachment.label}
            {attachment.durationSeconds
              ? ` · ${formatDuration(attachment.durationSeconds)}`
              : null}
          </span>
          <button
            type="button"
            onClick={() => setAttachment(null)}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-200 ease-out hover:text-foreground"
          >
            <Trash2 className="size-4" aria-hidden />
            <span className="sr-only">Remove attachment</span>
          </button>
        </div>
      ) : null}

      <form action={action} key={state.attempt}>
        <input type="hidden" name="threadId" value={threadId} />
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="mediaPath" value={attachment?.path ?? ""} />
        <input
          type="hidden"
          name="durationSeconds"
          value={attachment?.durationSeconds ?? ""}
        />

        {linkOpen && !attachment ? (
          <input
            /*
              type="text", NOT type="url". A url input refuses "celpare.com"
              with a native validation bubble, so pressing send appeared to do
              nothing at all. normaliseUrl adds the scheme on the server.

              16px below sm, or iOS zooms the page on focus and never returns
              (D91).
            */
            type="text"
            name="linkUrl"
            required
            autoFocus
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            placeholder="celpare.com"
            className="mb-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-[16px] text-foreground placeholder:text-muted sm:text-[15px]"
          />
        ) : null}

        <div className="flex items-end gap-1.5">
          <Recorder
            disabled={busy || Boolean(attachment)}
            onRecorded={(blob, seconds) =>
              upload(blob, "voice", voiceExtension(blob.type), seconds)
            }
            onError={setError}
          />

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy || Boolean(attachment)}
            title="Send a video"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground disabled:opacity-40"
          >
            <Paperclip className="size-[18px]" aria-hidden />
            <span className="sr-only">Send a video</span>
          </button>

          <button
            type="button"
            onClick={() => setLinkOpen((v) => !v)}
            disabled={busy || Boolean(attachment)}
            aria-pressed={linkOpen}
            title="Send a link"
            className={cn(
              "inline-flex size-11 shrink-0 items-center justify-center rounded-lg transition-colors duration-200 ease-out hover:bg-surface disabled:opacity-40",
              linkOpen ? "text-foreground" : "text-muted hover:text-foreground",
            )}
          >
            <Link2 className="size-[18px]" aria-hidden />
            <span className="sr-only">Send a link</span>
          </button>

          <label htmlFor="dm-body" className="sr-only">
            Message
          </label>
          <textarea
            id="dm-body"
            name="body"
            rows={1}
            defaultValue={state.body}
            placeholder={
              attachment ? "Send it, or add a note" : linkOpen ? "Say something about it" : "Message"
            }
            className="min-h-11 max-h-40 w-full flex-1 resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-[16px] text-foreground placeholder:text-muted sm:text-[15px]"
          />

          <Submit busy={busy} />
        </div>
      </form>

      <input
        ref={fileRef}
        type="file"
        accept="video/mp4,video/webm"
        onChange={onFile}
        className="hidden"
        tabIndex={-1}
      />

      {/* role=alert, because the ux guidance rates a visual only error High.
          Rendered only when there is one, so nothing is announced on load. */}
      {error || (state.status === "error" && state.message) ? (
        <p role="alert" className="mt-2 text-[13px] text-foreground">
          {error || state.message}
        </p>
      ) : null}
    </div>
  );
}

function Submit({ busy }: { busy: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending || busy}
      className="size-11 shrink-0 rounded-xl px-0"
    >
      <Send className="size-[18px]" aria-hidden />
      <span className="sr-only">{pending ? "Sending" : "Send"}</span>
    </Button>
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
      onError("This browser cannot record audio. Send a video or text instead.");
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
        className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border border-foreground px-3 text-[14px] font-medium"
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
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground disabled:opacity-40"
    >
      <Mic className="size-[18px]" aria-hidden />
      <span className="sr-only">Record a voice message</span>
    </button>
  );
}

function formatDuration(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
