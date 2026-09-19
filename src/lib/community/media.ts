import { isOwnUpload } from "@/lib/tools/media";

/*
  Post media: the buckets, the caps, and the one check that decides whether a
  URL reaching `post_media` is really an upload the caller made.

  The buckets are SEPARATE from tool-images and tool-videos on purpose. They
  hold different things with different risk: a developer's product shots for a
  listing that goes through review, against whatever anybody posts to a public
  feed. Keeping them apart means a retention rule, a moderation sweep or a
  deletion decision about one never has to be untangled from the other.

  The caps mirror the tool pair exactly, and the bucket itself enforces them
  along with the MIME allowlist, so they hold for a direct API call that never
  loaded the composer.
*/

export const POST_IMAGE_BUCKET = "post-images";
export const POST_VIDEO_BUCKET = "post-videos";

export const POST_BUCKETS = [POST_IMAGE_BUCKET, POST_VIDEO_BUCKET] as const;

export const MAX_POST_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_POST_VIDEO_BYTES = 50 * 1024 * 1024;

/* Mirrors tg_post_media_cap. The trigger is the control; these are what the
   composer uses to say no before somebody waits out an upload. */
export const MAX_POST_IMAGES = 4;

/*
  Is this URL an upload this person made into one of the POST buckets?

  The storage policy already stops one account writing into another's folder.
  This is the other half, and it is the one that matters here: it stops an
  account claiming somebody else's file, or any URL at all, by putting it in
  the hidden field the uploader normally fills in. Ownership is the first path
  segment, which is exactly what the storage policy checks.

  It also refuses a tool-images or tool-videos URL, because POST_BUCKETS does
  not contain them. That is deliberate rather than incidental: a post must not
  be able to reach into the developer media a review process put there.
*/
export function isOwnPostUpload(url: string, userId: string): boolean {
  return isOwnUpload(url, userId, POST_BUCKETS);
}
