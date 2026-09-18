/*
  What a tool's uploaded media is allowed to be.

  Isomorphic on purpose. The browser uses it to reject a file before spending a
  minute uploading it, and the server uses the SAME functions to decide whether
  what actually landed in the bucket is what it claimed to be. One definition,
  so the friendly check and the real check cannot drift.

  WHICH OF THE TWO IS THE CONTROL: the server one. The browser copy is a
  courtesy that saves somebody a wasted upload, and nothing here trusts it.

  THE MAGIC BYTES ARE THE TEST, NOT THE CONTENT TYPE. A client sends whatever
  Content-Type it likes, so `image/png` on a file whose first bytes are `<?php`
  or `<svg onload=` is trivially arranged. This is the same reasoning
  actions/avatar.ts wrote down in 4L.4, and the same sniffing, extended to
  video.

  SVG is not allowed at all. It is a document that executes, not a picture.
*/

export const IMAGE_BUCKET = "tool-images";
export const VIDEO_BUCKET = "tool-videos";

/* Must match storage.buckets.file_size_limit for each bucket. Storage enforces
   these for a direct API call too; these copies are for the error message. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export type ImageKind = "png" | "jpg" | "webp";
export type VideoKind = "mp4" | "webm";
export type MediaKind = ImageKind | VideoKind;

export const CONTENT_TYPE: Record<MediaKind, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
};

/* The number of leading bytes any check below needs. The server reads exactly
   this many with a Range request rather than downloading a 50 MB video to look
   at its first twelve bytes. */
export const SNIFF_BYTES = 16;

export function sniffImage(b: Uint8Array): ImageKind | null {
  // PNG: 89 50 4E 47 0D 0A 1A 0A, exactly eight bytes.
  if (
    b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) {
    return "png";
  }
  // JPEG: FF D8 FF.
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return "jpg";
  }
  // WebP: "RIFF" then four size bytes then "WEBP".
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

export function sniffVideo(b: Uint8Array): VideoKind | null {
  // MP4 and friends: a four byte size, then "ftyp" at offset 4. The brand that
  // follows is not checked, because mp4, m4v, iso and avc all play.
  if (
    b.length >= 8 &&
    b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70
  ) {
    return "mp4";
  }
  // WebM and every other Matroska container: the EBML header, 1A 45 DF A3.
  if (
    b.length >= 4 &&
    b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3
  ) {
    return "webm";
  }
  return null;
}

/*
  Where an uploaded file lives, pulled back out of its public URL.

  Returns null for anything that is not one of ours, which is the answer the
  server wants for an arbitrary host: a URL the person typed rather than a file
  they uploaded has no bucket and no owner, and must not reach tool_media.
*/
export function parseStorageUrl(
  url: string,
): { bucket: string; path: string } | null {
  const marker = "/storage/v1/object/public/";
  const at = url.indexOf(marker);
  if (at === -1) return null;

  const rest = url.slice(at + marker.length).split("?")[0];
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;

  const bucket = rest.slice(0, slash);
  const path = rest.slice(slash + 1);
  if (!path) return null;
  if (bucket !== IMAGE_BUCKET && bucket !== VIDEO_BUCKET) return null;

  return { bucket, path };
}

/*
  Is this URL an upload made by THIS person, into one of OUR buckets?

  The storage policy already stops one account writing into another's folder.
  This is the other half: it stops an account CLAIMING somebody else's file, or
  any URL at all, by typing it into the hidden field the uploader normally
  fills in. Ownership is the first path segment, which is the same thing the
  policy checks.
*/
export function isOwnUpload(url: string, userId: string): boolean {
  const parsed = parseStorageUrl(url);
  if (!parsed) return false;
  return parsed.path.startsWith(`${userId}/`);
}
