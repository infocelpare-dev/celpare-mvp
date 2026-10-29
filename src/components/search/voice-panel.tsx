"use client";

import { useEffect, useId, useRef } from "react";
import { Loader2, Mic, RotateCcw, Search, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { isBusy, isLowConfidence, isRecording } from "@/lib/voice/client/machine";
import { LANGUAGE_LABELS, type VoiceLanguage } from "@/lib/voice/types";
import type { useVoiceSearch } from "./use-voice-search";
import { SignInButton } from "@/components/auth/sign-in-prompt";

/*
  The voice search panel, under the search field (guide 21). It shows one state
  at a time, always with a way out: Stop while listening, Cancel while busy,
  Retry and Cancel after an error, Search and Cancel when the text is ready.

  The recognised text is an editable field. Nothing is searched until Search is
  pressed, and the typed query in the main field is never touched before that.
*/

type Voice = ReturnType<typeof useVoiceSearch>;

const STATUS_TEXT: Partial<Record<Voice["state"]["status"], string>> = {
  requesting_permission: "Waiting for microphone permission",
  ready: "Starting the microphone",
  listening: "Listening. Say what you are looking for.",
  stopping: "Finishing the recording",
  uploading: "Sending your recording",
  transcribing: "Turning speech into text",
  transcript_ready: "Check the text, then search.",
  submitted: "Searching",
};

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

export function VoicePanel({
  voice,
  typedQuery,
  onSearch,
}: {
  voice: Voice;
  /* What is in the main field now, so the panel can say a search will replace it. */
  typedQuery: string;
  onSearch: () => void;
}) {
  const { state } = voice;
  const editId = useId();
  const noteId = useId();
  const editRef = useRef<HTMLInputElement>(null);
  const stopRef = useRef<HTMLButtonElement>(null);
  const busy = isBusy(state);
  const recording = isRecording(state);
  const ready = state.status === "transcript_ready";
  const error = !busy && !ready && state.status !== "submitted" && state.status !== "idle";

  /* Focus follows the step: Stop while recording, the text when it arrives. */
  useEffect(() => {
    if (state.status === "listening") stopRef.current?.focus();
    if (state.status === "transcript_ready") editRef.current?.focus();
  }, [state.status]);

  const willReplace = typedQuery.trim().length > 0 && typedQuery.trim() !== state.transcript.trim();

  return (
    <div
      role="region"
      aria-label="Voice search"
      className="absolute inset-x-0 top-[calc(100%+6px)] z-30 rounded-xl border border-border bg-background p-3.5 shadow-sm"
    >
      {/* Busy steps are announced politely; errors interrupt (role=alert below). */}
      <div className="flex items-center gap-2.5" role="status" aria-live="polite">
        {recording ? (
          <span className="relative flex size-3 shrink-0" aria-hidden>
            <span className="absolute inline-flex size-full rounded-full bg-accent opacity-60 motion-safe:animate-ping" />
            <span className="relative inline-flex size-3 rounded-full bg-accent ring-1 ring-foreground/30" />
          </span>
        ) : busy || state.status === "submitted" ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted" aria-hidden />
        ) : null}
        <p className="text-[14px] text-foreground">{STATUS_TEXT[state.status] ?? ""}</p>
      </div>

      {state.status === "requesting_permission" ? (
        <p className="mt-1.5 text-[13px] text-muted">
          {voice.mode === "browser"
            ? "Allow the microphone when your browser asks. Your browser turns your speech into text."
            : "Allow the microphone when your browser asks. Your recording is sent to Google Cloud to be turned into text, then discarded. Celpare keeps only what you search."}
        </p>
      ) : null}

      {recording ? (
        <p className="mt-1.5 text-[13px] text-muted">
          {voice.mode === "browser" && state.transcript ? `"${state.transcript}"` : `Up to ${voice.maxSeconds} seconds. Press Stop when you are done.`}
        </p>
      ) : null}

      {voice.languages.length > 1 && (state.status === "requesting_permission" || recording || error) ? (
        <label className="mt-2.5 flex items-center gap-2 text-[13px] text-muted">
          Language
          <select
            value={voice.language}
            onChange={(e) => voice.setLanguage(e.target.value as VoiceLanguage)}
            disabled={busy && !recording}
            className={cn("h-11 rounded-lg border border-border bg-background px-2 text-[14px] text-foreground", focusRing)}
          >
            {voice.languages.map((l) => (
              <option key={l} value={l}>
                {LANGUAGE_LABELS[l]}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {ready || state.status === "submitted" ? (
        <form
          className="mt-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            onSearch();
          }}
        >
          <label htmlFor={editId} className="sr-only">
            Recognised search, edit before searching
          </label>
          <input
            ref={editRef}
            id={editId}
            value={state.transcript}
            onChange={(e) => voice.edit(e.target.value)}
            maxLength={200}
            readOnly={state.status === "submitted"}
            aria-describedby={noteId}
            className={cn(
              "h-11 w-full rounded-lg border border-border bg-background px-3 text-[16px] text-foreground sm:text-[15px]",
              focusRing,
            )}
          />
          <p id={noteId} className="mt-1.5 text-[13px] text-muted">
            {isLowConfidence(state)
              ? "We may have misheard. Check the words before you search."
              : willReplace
                ? "Searching replaces what you typed."
                : "You can edit this before you search."}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={state.status === "submitted" || !state.transcript.trim()}
              className={cn(
                "inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-full bg-foreground px-4 text-[14px] font-medium text-background disabled:cursor-default disabled:opacity-50",
                focusRing,
              )}
            >
              <Search className="size-4" aria-hidden />
              Search
            </button>
            <PanelButton onClick={voice.retry} disabled={state.status === "submitted"}>
              <Mic className="size-4" aria-hidden />
              Say it again
            </PanelButton>
            <PanelButton onClick={voice.cancel} disabled={state.status === "submitted"}>
              Cancel
            </PanelButton>
          </div>
        </form>
      ) : null}

      {error ? (
        <div className="mt-1.5">
          <p role="alert" className="text-[14px] text-foreground">
            {state.message}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {state.status === "auth_required" ? (
              <SignInButton className={cn("inline-flex h-11 items-center rounded-full bg-foreground px-4 text-[14px] font-medium text-background", focusRing)}>
                Sign in
              </SignInButton>
            ) : state.status !== "config_error" && state.status !== "unsupported" ? (
              <PanelButton onClick={voice.retry}>
                <RotateCcw className="size-4" aria-hidden />
                {state.canResend ? "Retry" : "Try again"}
              </PanelButton>
            ) : null}
            <PanelButton onClick={voice.cancel}>
              <X className="size-4" aria-hidden />
              Close
            </PanelButton>
          </div>
        </div>
      ) : null}

      {busy ? (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {recording ? (
            <button
              ref={stopRef}
              type="button"
              onClick={voice.stop}
              className={cn(
                "inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-full bg-foreground px-4 text-[14px] font-medium text-background",
                focusRing,
              )}
            >
              <Square className="size-3.5 fill-current" aria-hidden />
              Stop
            </button>
          ) : null}
          <PanelButton onClick={voice.cancel}>Cancel</PanelButton>
        </div>
      ) : null}
    </div>
  );
}

function PanelButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-full border border-border px-4 text-[14px] text-foreground transition-colors duration-200 ease-out hover:bg-surface disabled:cursor-default disabled:opacity-50",
        focusRing,
      )}
    >
      {children}
    </button>
  );
}
