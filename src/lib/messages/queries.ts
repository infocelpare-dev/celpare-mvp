import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DM_BUCKET, DM_FILES_BUCKET, DM_IMAGES_BUCKET } from "./shared";

/*
  Every direct message read.

  SERVER ONLY, and the import at the top enforces it. Everything here reads a
  private bucket and mints signed URLs, and a signed URL handed to a client
  module that then ships in a bundle is a leak with a long tail. The feed's
  query module has no such marker because the feed is public (D32); this is the
  opposite of that.

  There is no anon path in this file, deliberately. readerFor() exists in the
  community module because a signed out crawler must see the feed. Nobody
  signed out may see any of this, and anon holds no grant on any dm_ table, so
  the only client that appears here is the caller's own.
*/

/* How long a playback URL lives. Long enough to open a thread and listen,
   short enough that a copied URL is useless by the time it is shared. */
const SIGNED_URL_SECONDS = 60 * 30;

export type DmKind = "text" | "voice" | "link" | "video" | "file" | "image";

export type DmPerson = {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
};

export type DmMessage = {
  id: string;
  thread_id: string;
  sender_id: string;
  kind: DmKind;
  body: string | null;
  link_url: string | null;
  media_path: string | null;
  duration_seconds: number | null;
  /* TXT or CSV attachments (4BA). The name shown, never the path. */
  file_name: string | null;
  file_size: number | null;
  created_at: string;
  deleted_at: string | null;
  /* Minted per request from media_path. Never stored. */
  media_url?: string | null;
};

export type DmThreadSummary = {
  id: string;
  last_message_at: string;
  other: DmPerson | null;
  lastMessage: { kind: DmKind; body: string | null; sender_id: string } | null;
  unread: boolean;
};

/*
  The thread list, in ONE round trip (4AZ).

  It used to be three rounds in a row, and the middle one downloaded every
  message of every thread just to find each thread's latest, so the inbox got
  slower with every message ever sent. public.dm_inbox does the same work in
  SQL, reading only the newest message per thread off the (thread_id,
  created_at) index. It is SECURITY INVOKER, so the dm_ policies and the
  profiles policy apply to it exactly as they did to the queries it replaced.
*/
export async function listThreads(db: SupabaseClient): Promise<DmThreadSummary[]> {
  const { data, error } = await db.rpc("dm_inbox", { p_limit: 100 });

  if (error) {
    console.error("[dm] inbox failed", error.code, error.message);
    return [];
  }

  type Row = {
    thread_id: string;
    last_message_at: string;
    other_id: string | null;
    other_username: string | null;
    other_full_name: string | null;
    other_avatar_url: string | null;
    last_kind: DmKind | null;
    last_body: string | null;
    last_sender_id: string | null;
    unread: boolean;
  };

  return ((data ?? []) as Row[]).map((r) => ({
    id: r.thread_id,
    last_message_at: r.last_message_at,
    other:
      r.other_id && r.other_username
        ? {
            id: r.other_id,
            username: r.other_username,
            full_name: r.other_full_name,
            avatar_url: r.other_avatar_url,
          }
        : null,
    lastMessage:
      r.last_kind && r.last_sender_id
        ? { kind: r.last_kind, body: r.last_body, sender_id: r.last_sender_id }
        : null,
    unread: r.unread,
  }));
}

/* Is this thread mine to open, and who is the other person in it. Null when
   the policy will not show it, which covers "does not exist" and "not yours"
   with the same answer so neither can be told apart.

   ONE query (4AZ): the participant rows with the profile embedded through
   dm_participants_user_id_fkey. dm_participants_select_own returns rows only to
   somebody in the thread, so no rows means not yours, exactly as the separate
   dm_threads read used to decide. */
export async function getThread(
  db: SupabaseClient,
  threadId: string,
  viewerId: string,
): Promise<{ id: string; other: DmPerson | null } | null> {
  const { data, error } = await db
    .from("dm_participants")
    .select("user_id, profile:profiles!dm_participants_user_id_fkey(id, username, full_name, avatar_url)")
    .eq("thread_id", threadId);

  if (error) {
    console.error("[dm] thread failed", error.code, error.message);
    return null;
  }

  const rows = (data ?? []) as unknown as {
    user_id: string;
    profile: DmPerson | null;
  }[];
  if (!rows.some((r) => r.user_id === viewerId)) return null;

  const other = rows.find((r) => r.user_id !== viewerId)?.profile ?? null;
  return { id: threadId, other };
}

/*
  The messages in a thread, with a signed URL for anything that has media.

  Signing is batched, because createSignedUrls takes a list and one round trip
  beats one per voice note in a long thread.
*/
export async function getMessages(
  db: SupabaseClient,
  threadId: string,
): Promise<DmMessage[]> {
  const { data, error } = await db
    .from("dm_messages")
    .select(
      "id, thread_id, sender_id, kind, body, link_url, media_path, duration_seconds, file_name, file_size, created_at, deleted_at",
    )
    .eq("thread_id", threadId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(300);

  /* THROWS, never returns an empty list, on a failed read (4BA.11). Empty means
     "this conversation has no messages", and saying that when the read failed
     showed a real conversation as empty. messages/error.tsx takes it from here
     and reports it. */
  if (error) {
    console.error("[dm] messages failed", error.code, error.message);
    throw new Error(`dm messages read failed: ${error.code}`);
  }

  const rows = (data as DmMessage[]) ?? [];
  /* Voice and old video live in dm-media and are signed in one batch. */
  const mediaPaths = rows
    .filter((m) => m.media_path && (m.kind === "voice" || m.kind === "video"))
    .map((m) => m.media_path as string);

  /* Images live in dm-images and are signed for display, not download (4BB). */
  const imagePaths = rows
    .filter((m) => m.media_path && m.kind === "image")
    .map((m) => m.media_path as string);

  /*
    TXT and CSV live in dm-files and are signed ONE BY ONE with `download` set
    to the cleaned name. That makes storage answer with Content-Disposition:
    attachment, so the browser saves the file rather than displaying it, and it
    is served from the storage host, not from Celpare's origin. Nothing here
    reads, parses or previews a file: a signed URL is a string.
  */
  const files = rows.filter((m) => m.kind === "file" && m.media_path);

  const [mediaSigned, imageSigned, fileSigned] = await Promise.all([
    mediaPaths.length > 0
      ? db.storage.from(DM_BUCKET).createSignedUrls(mediaPaths, SIGNED_URL_SECONDS)
      : Promise.resolve({ data: [], error: null }),
    imagePaths.length > 0
      ? db.storage.from(DM_IMAGES_BUCKET).createSignedUrls(imagePaths, SIGNED_URL_SECONDS)
      : Promise.resolve({ data: [], error: null }),
    Promise.all(
      files.map((m) =>
        db.storage
          .from(DM_FILES_BUCKET)
          .createSignedUrl(m.media_path as string, SIGNED_URL_SECONDS, {
            download: m.file_name ?? true,
          }),
      ),
    ),
  ]);

  if (mediaSigned.error) {
    /* Rows still render, with the media marked unavailable rather than the
       whole thread failing over one bad path. */
    console.error("[dm] signing failed", mediaSigned.error.message);
  }

  if (imageSigned.error) {
    console.error("[dm] image signing failed", imageSigned.error.message);
  }

  const byPath = new Map<string, string | null>(
    [...(mediaSigned.data ?? []), ...(imageSigned.data ?? [])].map((x) => [
      x.path ?? "",
      x.signedUrl ?? null,
    ]),
  );
  files.forEach((m, i) => {
    byPath.set(m.media_path as string, fileSigned[i]?.data?.signedUrl ?? null);
  });

  return rows.map((m) =>
    m.media_path ? { ...m, media_url: byPath.get(m.media_path) ?? null } : m,
  );
}

/*
  Who this person can start a thread with: their FRIENDS, people they follow
  who follow them back (4BA, founder instruction). public.my_friends answers
  for auth.uid() only, and dm_start_thread refuses a non friend by itself, so
  this list is what to show and the database is what decides.
*/
export async function listPeople(db: SupabaseClient): Promise<DmPerson[]> {
  const { data, error } = await db.rpc("my_friends", { p_limit: 200 });

  if (error) {
    console.error("[dm] friends list failed", error.code, error.message);
    return [];
  }
  return (data as DmPerson[]) ?? [];
}

/* How many threads have something unread in them. Drives the mark on the
   Messages tab, and nothing else. */
export async function unreadThreadCount(db: SupabaseClient): Promise<number> {
  const threads = await listThreads(db);
  return threads.filter((t) => t.unread).length;
}
