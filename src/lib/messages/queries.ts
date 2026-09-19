import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DM_BUCKET } from "./shared";

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

export type DmKind = "text" | "voice" | "link" | "video";

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
  The thread list.

  Three narrow queries rather than one clever join. PostgREST cannot express
  "the other participant" in a single embed without also handing back my own
  row, and the policies already restrict every one of these to threads I am in,
  so the cost is two extra round trips and the benefit is a query anybody can
  read.
*/
export async function listThreads(
  db: SupabaseClient,
  viewerId: string,
): Promise<DmThreadSummary[]> {
  const { data: threads, error } = await db
    .from("dm_threads")
    .select("id, last_message_at")
    .order("last_message_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[dm] threads failed", error.code, error.message);
    return [];
  }

  const rows = (threads ?? []) as { id: string; last_message_at: string }[];
  if (rows.length === 0) return [];

  const ids = rows.map((t) => t.id);

  const [participants, lastMessages] = await Promise.all([
    db
      .from("dm_participants")
      .select("thread_id, user_id, last_read_at")
      .in("thread_id", ids),
    db
      .from("dm_messages")
      .select("thread_id, sender_id, kind, body, created_at")
      .in("thread_id", ids)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  type P = { thread_id: string; user_id: string; last_read_at: string | null };
  type M = {
    thread_id: string;
    sender_id: string;
    kind: DmKind;
    body: string | null;
    created_at: string;
  };

  const parts = (participants.data ?? []) as P[];
  const msgs = (lastMessages.data ?? []) as M[];

  /* Ordered newest first above, so the first one seen per thread is the
     latest. */
  const latest = new Map<string, M>();
  for (const m of msgs) if (!latest.has(m.thread_id)) latest.set(m.thread_id, m);

  const otherIds = parts
    .filter((p) => p.user_id !== viewerId)
    .map((p) => p.user_id);

  const people = await loadPeople(db, otherIds);

  return rows.map((t) => {
    const mine = parts.find((p) => p.thread_id === t.id && p.user_id === viewerId);
    const theirs = parts.find((p) => p.thread_id === t.id && p.user_id !== viewerId);
    const last = latest.get(t.id) ?? null;

    /*
      Unread means: there is a message, it is not mine, and it landed after I
      last opened the thread. Never opened counts as unread, which is what a
      brand new thread from somebody else is.
    */
    const unread = Boolean(
      last &&
        last.sender_id !== viewerId &&
        (!mine?.last_read_at || new Date(last.created_at) > new Date(mine.last_read_at)),
    );

    return {
      id: t.id,
      last_message_at: t.last_message_at,
      other: theirs ? people.get(theirs.user_id) ?? null : null,
      lastMessage: last
        ? { kind: last.kind, body: last.body, sender_id: last.sender_id }
        : null,
      unread,
    };
  });
}

async function loadPeople(
  db: SupabaseClient,
  ids: string[],
): Promise<Map<string, DmPerson>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();

  const { data, error } = await db
    .from("profiles")
    .select("id, username, full_name, avatar_url")
    .in("id", unique);

  if (error) {
    console.error("[dm] people failed", error.code, error.message);
    return new Map();
  }
  return new Map((data as DmPerson[]).map((p) => [p.id, p]));
}

/* Is this thread mine to open, and who is the other person in it. Null when
   the policy will not show it, which covers "does not exist" and "not yours"
   with the same answer so neither can be told apart. */
export async function getThread(
  db: SupabaseClient,
  threadId: string,
  viewerId: string,
): Promise<{ id: string; other: DmPerson | null } | null> {
  const { data, error } = await db
    .from("dm_threads")
    .select("id")
    .eq("id", threadId)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("[dm] thread failed", error.code, error.message);
    return null;
  }

  const { data: parts } = await db
    .from("dm_participants")
    .select("user_id")
    .eq("thread_id", threadId);

  const otherId = ((parts ?? []) as { user_id: string }[]).find(
    (p) => p.user_id !== viewerId,
  )?.user_id;

  const people = otherId ? await loadPeople(db, [otherId]) : new Map();

  return { id: threadId, other: otherId ? people.get(otherId) ?? null : null };
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
      "id, thread_id, sender_id, kind, body, link_url, media_path, duration_seconds, created_at, deleted_at",
    )
    .eq("thread_id", threadId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(300);

  if (error) {
    console.error("[dm] messages failed", error.code, error.message);
    return [];
  }

  const rows = (data as DmMessage[]) ?? [];
  const paths = rows
    .map((m) => m.media_path)
    .filter((p): p is string => Boolean(p));

  if (paths.length === 0) return rows;

  const { data: signed, error: signError } = await db.storage
    .from(DM_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_SECONDS);

  if (signError) {
    console.error("[dm] signing failed", signError.message);
    /* Rows still render, with the media marked unavailable rather than the
       whole thread failing over one bad path. */
    return rows;
  }

  const byPath = new Map(
    (signed ?? []).map((s) => [s.path ?? "", s.signedUrl ?? null]),
  );

  return rows.map((m) =>
    m.media_path ? { ...m, media_url: byPath.get(m.media_path) ?? null } : m,
  );
}

/*
  Who this person can start a thread with.

  Everybody else, which is the open policy dm_start_thread implements and the
  gap it records. Ordered by username so the picker is a lookup rather than a
  browse, and capped: this is a select, not a directory.
*/
export async function listPeople(
  db: SupabaseClient,
  viewerId: string,
): Promise<DmPerson[]> {
  const { data, error } = await db
    .from("profiles")
    .select("id, username, full_name, avatar_url")
    .neq("id", viewerId)
    .order("username", { ascending: true })
    .limit(200);

  if (error) {
    console.error("[dm] people list failed", error.code, error.message);
    return [];
  }
  return (data as DmPerson[]) ?? [];
}

/* How many threads have something unread in them. Drives the mark on the
   Messages tab, and nothing else. */
export async function unreadThreadCount(
  db: SupabaseClient,
  viewerId: string,
): Promise<number> {
  const threads = await listThreads(db, viewerId);
  return threads.filter((t) => t.unread).length;
}
