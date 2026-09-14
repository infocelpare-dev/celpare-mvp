"use server";

import { revalidatePath } from "next/cache";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export type AvatarState = {
  status: "idle" | "success" | "error";
  message: string;
};

/*
  Profile picture upload. Founder instruction 2026-09-14, reversing D71.

  D42's objection was that an upload button without a bucket, a size limit, a
  type check and a retention answer "would be the most dangerous thing in this
  build". So the controls are here rather than assumed:

    1. The bucket caps size at 2 MB and allowlists three image types. That is
       enforced by storage, so it holds for a direct API call too.
    2. The path is `<user id>/avatar-<timestamp>.<ext>`, and the storage policy
       requires the first path segment to equal auth.uid(). One account cannot
       write into another account's folder.
    3. The MAGIC BYTES are checked below, not the declared content type. A
       browser sends whatever Content-Type it likes, so `image/png` on a file
       whose first bytes are `<?php` or `<svg onload=` is trivially arranged.
       SVG is deliberately not allowed at all: it is a document that executes,
       not a picture.
    4. The previous file is deleted after a successful replace, so a person
       swapping their picture ten times leaves one file rather than ten.

  Still open, and logged as gaps rather than pretended away: there is no image
  moderation, and no retention policy for pictures belonging to deleted
  accounts. Both are policy questions, not code.
*/

const MAX_BYTES = 2 * 1024 * 1024;

/* What the file actually is, read from its first bytes. */
function sniff(bytes: Uint8Array): "png" | "jpg" | "webp" | null {
  // PNG: 89 50 4E 47 0D 0A 1A 0A. The signature is exactly 8 bytes, so the
  // comparison is >= and not >, which is what the byte tests caught.
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "png";
  }
  // JPEG: FF D8 FF, three bytes, so >= 3.
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpg";
  }
  // WebP: "RIFF" then 4 size bytes then "WEBP", twelve bytes exactly, so >= 12.
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

const CONTENT_TYPE = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
} as const;

export async function uploadAvatar(
  _prev: AvatarState,
  formData: FormData,
): Promise<AvatarState> {
  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Not connected." };
  }

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Choose an image first." };
  }

  if (file.size > MAX_BYTES) {
    return { status: "error", message: "That image is over 2 MB. Try a smaller one." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(bytes);

  if (!kind) {
    // Deliberately does not echo the declared type back. The point is that we
    // did not believe it.
    return {
      status: "error",
      message: "That file is not a PNG, JPEG or WebP image.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "Sign in to change your picture." };
  }

  /*
    A fresh name every time rather than a fixed `avatar.png`.

    Overwriting one path would be tidier and would serve a stale picture for as
    long as the CDN cached it, which for an avatar someone just changed is the
    one thing they will notice immediately. A new name makes the new URL
    obviously new.
  */
  const path = `${user.id}/avatar-${Date.now()}.${kind}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, bytes, { contentType: CONTENT_TYPE[kind], upsert: false });

  if (uploadError) {
    console.error("[avatar] upload failed", uploadError.message);
    return { status: "error", message: "Could not upload that. Please try again." };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("avatars").getPublicUrl(path);

  // Read the old one before overwriting the column, so it can be cleaned up.
  const { data: before } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ avatar_url: publicUrl })
    .eq("id", user.id);

  if (updateError) {
    console.error("[avatar] profile update failed", updateError.code, updateError.message);
    // Do not leave the uploaded file behind when the row never pointed at it.
    await supabase.storage.from("avatars").remove([path]);
    return { status: "error", message: "Could not save that. Please try again." };
  }

  await removeOldAvatar(supabase, user.id, before?.avatar_url ?? null, path);

  revalidatePath("/settings");
  revalidatePath("/profile");
  revalidatePath("/profile/edit");
  return { status: "success", message: "Picture updated." };
}

/* Takes no arguments on purpose: there is nothing to read from the form, and
   useActionState is happy with a function that accepts fewer parameters than
   it passes. */
export async function removeAvatar(): Promise<AvatarState> {
  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Not connected." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "Sign in to change your picture." };
  }

  const { data: before } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: null })
    .eq("id", user.id);

  if (error) {
    console.error("[avatar] remove failed", error.code, error.message);
    return { status: "error", message: "Could not remove that. Please try again." };
  }

  await removeOldAvatar(supabase, user.id, before?.avatar_url ?? null, null);

  revalidatePath("/settings");
  revalidatePath("/profile");
  revalidatePath("/profile/edit");
  return { status: "success", message: "Picture removed. Your initials are back." };
}

/*
  Delete the file a profile used to point at.

  Only ever touches our own bucket and only a path under this user's folder,
  which is checked here AND by the storage policy. The OAuth picture a person
  signed up with is not ours and is left alone, which is what the bucket check
  below is really for.
*/
async function removeOldAvatar(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  previousUrl: string | null,
  keepPath: string | null,
): Promise<void> {
  if (!previousUrl) return;

  const marker = "/storage/v1/object/public/avatars/";
  const at = previousUrl.indexOf(marker);
  if (at === -1) return; // Not one of ours, for example the Google picture.

  const oldPath = previousUrl.slice(at + marker.length).split("?")[0];
  if (!oldPath || oldPath === keepPath) return;
  if (!oldPath.startsWith(`${userId}/`)) return;

  const { error } = await supabase.storage.from("avatars").remove([oldPath]);
  if (error) {
    // Not worth failing the request over. The picture is already changed, and
    // an orphaned file is a cleanup job rather than a broken profile.
    console.error("[avatar] old file cleanup failed", error.message);
  }
}
