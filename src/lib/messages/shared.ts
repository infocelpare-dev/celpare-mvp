/*
  Values the DM composer needs on the CLIENT and the reader needs on the
  server.

  Its own module, with no "server-only" marker and no imports, because
  lib/messages/queries.ts carries that marker on purpose: it mints signed URLs
  for a private bucket and must never reach a browser bundle. A client
  component importing the bucket name from there would drag the whole module
  in and fail the build.

  Putting them in the "use server" actions file was the other option and is
  wrong for a different reason: that module may export async functions only, so
  each constant would have to become a function call and a round trip.
*/

export const DM_BUCKET = "dm-media";

/* Mirrors the bucket's own file_size_limit, which is the real control. These
   are what the composer uses to refuse a file before somebody waits out the
   upload. */
export const MAX_DM_MEDIA_BYTES = 50 * 1024 * 1024;

/* Mirrors dm_messages_duration_ok. Ten minutes is far longer than anybody
   speaks into a message and short enough to bound the file. */
export const MAX_VOICE_SECONDS = 600;

/*
  What MediaRecorder is asked for, in order of preference.

  Chrome and Firefox give audio/webm with Opus. Safari gives audio/mp4 with
  AAC and does not support webm at all, so asking only for webm would silently
  break recording for every Safari user. The bucket's MIME allowlist accepts
  both, and so does the audio element that plays them back.
*/
export const VOICE_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
] as const;

/* Extension for a recorded blob, from whatever type the browser actually
   produced. The bucket checks the MIME type, not this, but a file named .bin
   is one nobody can open after downloading it. */
export function voiceExtension(mimeType: string): string {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}
