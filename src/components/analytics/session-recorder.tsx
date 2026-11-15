"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { RRWEB_PRIVACY, consoleUnmasks, type ConsolePrivacy } from "@/lib/statsig/replay-privacy";

/*
  Session recordings for the founder, sent to Statsig (D269).

  WHAT IS RECORDED. How a page was used: which pages, clicks, scrolls and the
  shape of the screen. Every piece of text is replaced with asterisks and every
  form field is masked before it leaves the browser, and pictures, video and
  frames are left out. So a recording shows where somebody went and where they
  got stuck, never what they wrote or read. Never loosen this globally: these
  pages carry private messages, Ask questions and email addresses.

  NOTHING IS STORED IN THE BROWSER, which is what the Cookie Policy promises.
  Storage and the SDK's own stable id are both off; the server says who this
  browser is (api/telemetry/identity), with the same ids page views use (D264).
  The price is that a full page reload starts a new recording.

  WHO IS NOT RECORDED. A browser that sends Global Privacy Control or Do Not
  Track, the same rule as page views. Bots. The admin dashboard, which shows
  other people's account data. Development.

  THE CONSOLE CAN OVERRIDE THE MASKING. Statsig's privacy settings replace the
  rules below when they are set to anything but the default. If they would
  show text, this refuses to record at all rather than record unmasked.
*/

const IDENTITY = "/api/telemetry/identity";

type Identity = { key: string; userID: string; stableID: string; signedIn: boolean };

type Recorder = {
  identity: Identity;
  update: (next: Identity) => Promise<void>;
  start: () => void;
  stop: () => void;
};

function optedOut(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.globalPrivacyControl === true || navigator.doNotTrack === "1";
}

function isAdmin(path: string | null): boolean {
  return Boolean(path && (path === "/admin" || path.startsWith("/admin/")));
}

/* The sign in cookie is readable by design (@supabase/ssr). Only its presence
   is looked at, to notice a log in or log out without asking the server on
   every navigation. */
function looksSignedIn(): boolean {
  return /(?:^|;\s*)sb-[^=]*-auth-token/.test(document.cookie);
}

async function fetchIdentity(): Promise<Identity | null> {
  const res = await fetch(IDENTITY, { cache: "no-store", credentials: "same-origin" });
  if (res.status !== 200) return null;
  const body = (await res.json()) as Partial<Identity>;
  if (!body.key || !body.userID || !body.stableID) return null;
  return { key: body.key, userID: body.userID, stableID: body.stableID, signedIn: Boolean(body.signedIn) };
}

function statsigUser(id: Identity) {
  return { userID: id.userID, customIDs: { stableID: id.stableID }, custom: { signed_in: id.signedIn } };
}

async function boot(identity: Identity): Promise<Recorder | null> {
  const [{ StatsigClient }, replay] = await Promise.all([
    import("@statsig/js-client"),
    import("@statsig/session-replay"),
  ]);

  const client = new StatsigClient(identity.key, statsigUser(identity), {
    disableStorage: true,
    disableStableID: true,
    environment: { tier: "production" },
  });
  await client.initializeAsync();

  const values = client.getContext().values as { session_recording_privacy_settings?: ConsolePrivacy } | null;
  if (consoleUnmasks(values?.session_recording_privacy_settings)) {
    console.warn("[celpare] Session recording is off: the Statsig console privacy settings would show text.");
    await client.shutdown();
    return null;
  }

  replay.runStatsigSessionReplay(client, { rrwebConfig: { ...RRWEB_PRIVACY } });

  const recorder: Recorder = {
    identity,
    update: async (next) => {
      recorder.identity = next;
      await client.updateUserAsync(statsigUser(next));
    },
    start: () => replay.startRecording(identity.key),
    stop: () => replay.stopRecording(identity.key),
  };
  return recorder;
}

/* The account id on Sentry's errors and replays, so /admin/users can list one
   person's replays. An id only: no email, no name, no address. */
async function tagSentry(identity: Identity) {
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.setUser(identity.signedIn ? { id: identity.userID } : null);
  } catch {
    /* Sentry is optional. */
  }
}

export function SessionRecorder() {
  const pathname = usePathname();
  const recorder = useRef<Recorder | null>(null);
  const started = useRef(false);
  const paused = useRef(false);

  /* Start once, on the first page that is not the admin dashboard. */
  useEffect(() => {
    if (started.current || process.env.NODE_ENV !== "production") return;
    if (isAdmin(pathname)) return;
    started.current = true;
    void (async () => {
      try {
        if (optedOut()) return;
        const identity = await fetchIdentity();
        if (!identity) return;
        void tagSentry(identity);
        recorder.current = await boot(identity);
      } catch {
        /* A recording is never worth an error. */
      }
    })();
  }, [pathname]);

  /* Pause inside the admin dashboard; notice a log in or log out. */
  useEffect(() => {
    const r = recorder.current;
    if (!r) return;
    try {
      const admin = isAdmin(pathname);
      if (admin && !paused.current) {
        paused.current = true;
        r.stop();
      } else if (!admin && paused.current) {
        paused.current = false;
        r.start();
      }
      if (looksSignedIn() !== r.identity.signedIn) {
        void fetchIdentity()
          .then(async (next) => {
            if (!next || next.userID === r.identity.userID) return;
            void tagSentry(next);
            await r.update(next);
          })
          .catch(() => {});
      }
    } catch {
      /* Same rule. */
    }
  }, [pathname]);

  return null;
}
