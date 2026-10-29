"use client";

import { useCallback, useEffect, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { INITIAL, messageFor, reduce, type ClientErrorCode, type VoiceState } from "@/lib/voice/client/machine";
import { canRecord, RecorderError, VoiceRecorder, type MediaEnv, type Recording } from "@/lib/voice/client/recorder";
import { ENDPOINT, uploadRecording, type Upload } from "@/lib/voice/client/upload";
import type { VoiceCapabilities, VoiceLanguage } from "@/lib/voice/types";

/*
  Voice search for the search field (guide 21). Two paths behind one state machine:

  SERVER (preferred): MediaRecorder records one short utterance, it is uploaded
  to /api/voice/transcribe, Google Cloud Speech-to-Text returns text. Needs the
  provider configured on the server and a signed in person.

  BROWSER (fallback): the browser's own speech recognition, where it exists
  (Chrome, Edge, Safari), when the server provider is off or the person is
  signed out. Never the only path: support varies and Firefox has none.

  Either way the result is TEXT IN A BOX the person can edit, and nothing is
  searched until they press Search. Audio is held only until a transcript
  arrives (or the panel closes), so Retry can resend it; then it is dropped.
*/

type Mode = "server" | "browser";

/* ------------------------------------------------- browser speech fallback */

type BrowserRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((e: { resultIndex: number; results: { length: number; [i: number]: { isFinal: boolean; 0: { transcript: string } } } }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

function browserCtor(): (new () => BrowserRecognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => BrowserRecognition; webkitSpeechRecognition?: new () => BrowserRecognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function mediaEnv(): MediaEnv {
  const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
  return {
    getUserMedia: md?.getUserMedia ? (c) => md.getUserMedia(c) : undefined,
    MediaRecorder: typeof MediaRecorder !== "undefined" ? MediaRecorder : undefined,
    now: () => performance.now(),
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (id) => window.clearTimeout(id as number),
  };
}

/* --------------------------------------------------------- capabilities */

let capsPromise: Promise<VoiceCapabilities | null> | null = null;

function loadCapabilities(): Promise<VoiceCapabilities | null> {
  capsPromise ??= fetch(ENDPOINT, { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<VoiceCapabilities>) : null))
    .catch(() => null);
  return capsPromise;
}

const noop = () => () => {};
const LANG_KEY = "celpare.voice.language";

export function useVoiceSearch() {
  const [state, dispatch] = useReducer(reduce, INITIAL);
  const [caps, setCaps] = useState<VoiceCapabilities | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [language, setLanguageState] = useState<VoiceLanguage>("auto");

  const hasBrowserSpeech = useSyncExternalStore(noop, () => browserCtor() !== null, () => false);
  const hasRecorder = useSyncExternalStore(noop, () => canRecord(mediaEnv()), () => false);

  const recorder = useRef<VoiceRecorder | null>(null);
  const upload = useRef<Upload | null>(null);
  const recognition = useRef<BrowserRecognition | null>(null);
  const lastRecording = useRef<Recording | null>(null);
  const stateRef = useRef<VoiceState>(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  /* Capabilities once per page; the remembered language, if any. Both are
     set from async callbacks, never synchronously in the effect body. */
  useEffect(() => {
    let alive = true;
    void loadCapabilities().then((c) => {
      if (!alive) return;
      setCaps(c);
      try {
        const saved = window.localStorage.getItem(LANG_KEY) as VoiceLanguage | null;
        if (saved && c?.languages.includes(saved)) setLanguageState(saved);
      } catch {
        /* Private mode: the default is fine. */
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const serverReady = Boolean(caps?.enabled && caps.signedIn && hasRecorder);
  /* Show the microphone only when some path can work, or when signing in would
     make one work (so the person learns voice search exists). */
  const available = serverReady || hasBrowserSpeech || Boolean(caps?.enabled && hasRecorder);

  const fail = useCallback((code: ClientErrorCode, message?: string) => dispatch({ type: "ERROR", code, message }), []);

  const dropAudio = () => {
    lastRecording.current = null;
  };

  const send = useCallback(
    (rec: Recording) => {
      dispatch({ type: "RECORDED" });
      const u = uploadRecording(rec.blob, {
        language,
        durationMs: rec.durationMs,
        timeoutMs: 30_000,
        onUploaded: () => dispatch({ type: "UPLOADED" }),
      });
      upload.current = u;
      void u.promise.then((r) => {
        if (upload.current !== u) return;
        upload.current = null;
        if (r.ok) {
          dropAudio();
          dispatch({ type: "RESULT", transcript: r.result.transcript, language: r.result.language, confidence: r.result.confidence });
        } else {
          if (r.code !== "network" && r.code !== "timeout" && r.code !== "rate_limited" && r.code !== "provider_unavailable") dropAudio();
          fail(r.code, r.message);
        }
      });
    },
    [language, fail],
  );

  const finishRecording = useCallback(async () => {
    const r = recorder.current;
    if (!r) return;
    if (stateRef.current.status === "listening" || stateRef.current.status === "ready") dispatch({ type: "STOP" });
    const rec = await r.stop();
    recorder.current = null;
    if (!rec) {
      /* Cancelled, or nothing captured. */
      if (stateRef.current.status !== "idle") fail("empty_audio");
      return;
    }
    if (rec.tooLarge) {
      fail("too_large");
      return;
    }
    lastRecording.current = rec;
    send(rec);
  }, [fail, send]);

  const startServer = useCallback(async () => {
    const r = new VoiceRecorder(
      mediaEnv(),
      { maxMs: (caps?.maxSeconds ?? 15) * 1000, maxBytes: caps?.maxBytes ?? 1_000_000 },
      () => void finishRecording(),
    );
    recorder.current = r;
    try {
      await r.start();
      dispatch({ type: "PERMISSION_GRANTED" });
      dispatch({ type: "RECORDING_STARTED" });
    } catch (err) {
      recorder.current = null;
      fail(err instanceof RecorderError ? (err.code === "busy" ? "unsupported" : err.code === "failed" ? "unsupported" : err.code) : "unsupported");
    }
  }, [caps, fail, finishRecording]);

  const startBrowser = useCallback(() => {
    const Ctor = browserCtor();
    if (!Ctor) {
      fail("unsupported");
      return;
    }
    const rec = new Ctor();
    rec.lang = language === "auto" ? navigator.language || "en-US" : language;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let finalText = "";
    let errored = false;
    rec.onstart = () => {
      dispatch({ type: "PERMISSION_GRANTED" });
      dispatch({ type: "RECORDING_STARTED" });
    };
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interim += res[0].transcript;
      }
      dispatch({ type: "BROWSER_INTERIM", transcript: (finalText + interim).trim() });
    };
    rec.onerror = (e) => {
      if (e.error === "aborted") return;
      errored = true;
      const map: Record<string, ClientErrorCode> = {
        "not-allowed": "permission_denied",
        "service-not-allowed": "unsupported",
        "no-speech": "no_speech",
        "audio-capture": "no_microphone",
        network: "network",
        "language-not-supported": "unsupported_language",
      };
      fail(map[e.error] ?? "provider_unavailable");
    };
    rec.onend = () => {
      recognition.current = null;
      if (errored) return;
      const s = stateRef.current;
      if (s.status === "idle") return;
      dispatch({ type: "RESULT", transcript: finalText || s.transcript, language: language === "auto" ? null : language, confidence: null });
    };
    recognition.current = rec;
    try {
      rec.start();
    } catch {
      recognition.current = null;
      fail("unsupported");
    }
  }, [language, fail]);

  const start = useCallback(async () => {
    if (stateRef.current.status !== "idle" && !["no_speech", "permission_denied", "unsupported", "network_error", "config_error", "auth_required", "too_large", "rate_limited", "failed", "transcript_ready", "submitted"].includes(stateRef.current.status)) return;
    dispatch({ type: "START" });
    dropAudio();
    const c = caps ?? (await loadCapabilities());
    if (c && !caps) setCaps(c);
    if (c?.enabled && c.signedIn && hasRecorder) {
      setMode("server");
      await startServer();
    } else if (hasBrowserSpeech) {
      setMode("browser");
      startBrowser();
    } else if (c?.enabled && !c.signedIn) {
      fail("auth_required");
    } else if (!hasRecorder) {
      fail("unsupported");
    } else {
      fail("not_configured");
    }
  }, [caps, hasRecorder, hasBrowserSpeech, startServer, startBrowser, fail]);

  const stop = useCallback(() => {
    if (mode === "browser") {
      dispatch({ type: "STOP" });
      recognition.current?.stop();
      return;
    }
    void finishRecording();
  }, [mode, finishRecording]);

  const cancel = useCallback(() => {
    recorder.current?.cancel();
    recorder.current = null;
    upload.current?.abort();
    upload.current = null;
    recognition.current?.abort();
    recognition.current = null;
    dropAudio();
    dispatch({ type: "CANCEL" });
  }, []);

  const retry = useCallback(() => {
    const s = stateRef.current;
    if (s.canResend && lastRecording.current && mode === "server") {
      dispatch({ type: "RETRY" });
      send(lastRecording.current);
      return;
    }
    dispatch({ type: "CANCEL" });
    void start();
  }, [mode, send, start]);

  /* Returns the text to search, once. Null when empty or already submitted. */
  const submit = useCallback((): string | null => {
    const s = stateRef.current;
    const text = s.transcript.trim();
    if (s.status !== "transcript_ready" || !text) return null;
    dispatch({ type: "SUBMIT" });
    stateRef.current = { ...s, status: "submitted", transcript: text };
    return text;
  }, []);

  const setLanguage = useCallback((l: VoiceLanguage) => {
    setLanguageState(l);
    try {
      window.localStorage.setItem(LANG_KEY, l);
    } catch {
      /* Remembering is a convenience only. */
    }
  }, []);

  /* Leaving the page stops everything: the microphone light goes out and no
     request is left running. */
  useEffect(
    () => () => {
      recorder.current?.dispose();
      upload.current?.abort();
      recognition.current?.abort();
      lastRecording.current = null;
    },
    [],
  );

  return {
    state,
    available,
    mode,
    serverReady,
    languages: serverReady ? (caps?.languages ?? []) : ([] as VoiceLanguage[]),
    language,
    setLanguage,
    maxSeconds: caps?.maxSeconds ?? 15,
    start,
    stop,
    cancel,
    retry,
    edit: (transcript: string) => dispatch({ type: "EDIT", transcript }),
    submit,
    messageFor,
  };
}
