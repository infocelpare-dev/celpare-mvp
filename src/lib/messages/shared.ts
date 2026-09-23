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

/* Mirrors the bucket's own file_size_limit (10 MB since 4BA, voice only), which
   is the real control. */
export const MAX_DM_MEDIA_BYTES = 10 * 1024 * 1024;

/*
  ATTACHMENTS ARE TXT AND CSV ONLY (4BA, founder instruction). Their own private
  bucket, whose allowed_mime_types and 1 MB file_size_limit the storage server
  enforces before any policy or any of our code runs. These mirror it so the
  composer can refuse a file before the upload starts.
*/
export const DM_FILES_BUCKET = "dm-files";
export const MAX_DM_FILE_BYTES = 1024 * 1024;
export const DM_FILE_TYPES: Record<"txt" | "csv", string> = {
  txt: "text/plain",
  csv: "text/csv",
};

/*
  The name shown to the recipient, never used as a path. Letters, digits,
  spaces and . _ ( ) - only, one extension, 120 characters at most: the same
  rule dm_messages_file_ok enforces, so a name that passes here passes there.
  Returns null when nothing usable is left or the extension is not txt/csv.
*/
export function cleanFileName(raw: string): { name: string; ext: "txt" | "csv" } | null {
  const base = raw.split(/[\\/]/).pop() ?? "";
  const match = /\.(txt|csv)$/i.exec(base);
  if (!match) return null;
  const ext = match[1].toLowerCase() as "txt" | "csv";
  const stem = base
    .slice(0, -match[0].length)
    .replace(/[^A-Za-z0-9 ._()-]/g, "_")
    .replace(/\.+/g, ".")
    .trim()
    .slice(0, 110);
  const name = `${stem || "file"}.${ext}`;
  return name.length >= 5 ? { name, ext } : { name: `file.${ext}`, ext };
}

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

/*
  IMAGES AND VIDEOS AS ATTACHMENTS (4BB). One paperclip, three kinds, each with
  its own limit that the storage server enforces on its bucket:

    image  JPG, PNG, WebP   5 MB   dm-images
    video  MP4, WebM       25 MB   dm-media (with voice notes, as before)
    file   TXT, CSV         1 MB   dm-files

  No SVG (it can carry script) and no GIF (not asked for).
*/
export const DM_IMAGES_BUCKET = "dm-images";
export const MAX_DM_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_DM_VIDEO_BYTES = 25 * 1024 * 1024;

export type AttachKind = "image" | "video" | "file";

const ATTACH_TYPES: Record<string, { kind: AttachKind; mime: string; ext: string }> = {
  jpg: { kind: "image", mime: "image/jpeg", ext: "jpg" },
  jpeg: { kind: "image", mime: "image/jpeg", ext: "jpg" },
  png: { kind: "image", mime: "image/png", ext: "png" },
  webp: { kind: "image", mime: "image/webp", ext: "webp" },
  mp4: { kind: "video", mime: "video/mp4", ext: "mp4" },
  webm: { kind: "video", mime: "video/webm", ext: "webm" },
  txt: { kind: "file", mime: "text/plain", ext: "txt" },
  csv: { kind: "file", mime: "text/csv", ext: "csv" },
};

/* What a picked file is, from its extension only. The bytes are checked
   separately (matchesSignature), because a name proves nothing. */
export function classifyAttachment(
  name: string,
): { kind: AttachKind; mime: string; ext: string } | null {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(name);
  return m ? ATTACH_TYPES[m[1].toLowerCase()] ?? null : null;
}

export function maxBytesFor(kind: AttachKind): number {
  return kind === "image" ? MAX_DM_IMAGE_BYTES : kind === "video" ? MAX_DM_VIDEO_BYTES : MAX_DM_FILE_BYTES;
}

/*
  Do the first bytes of a file match what its extension claims. Pure, so the
  composer and sendMessage run the same code. Reads at most the first 12 bytes
  and interprets nothing: it compares them to each format's fixed signature.

    jpg   FF D8 FF
    png   89 50 4E 47 0D 0A 1A 0A
    webp  "RIFF" .... "WEBP"
    mp4   .... "ftyp"   (also m4a voice)
    webm  1A 45 DF A3   (EBML, video and voice)
    ogg   "OggS"
    mp3   "ID3" or an MPEG frame sync FF Ex / FF Fx
*/
export function matchesSignature(ext: string, b: Uint8Array): boolean {
  const at = (i: number, ...bytes: number[]) => bytes.every((x, j) => b[i + j] === x);
  const ascii = (i: number, s: string) => at(i, ...[...s].map((c) => c.charCodeAt(0)));
  switch (ext) {
    case "jpg":
      return at(0, 0xff, 0xd8, 0xff);
    case "png":
      return at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case "webp":
      return ascii(0, "RIFF") && ascii(8, "WEBP");
    case "mp4":
    case "m4a":
      return ascii(4, "ftyp");
    case "webm":
      return at(0, 0x1a, 0x45, 0xdf, 0xa3);
    case "ogg":
      return ascii(0, "OggS");
    case "mp3":
      return ascii(0, "ID3") || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0);
    default:
      return false;
  }
}
