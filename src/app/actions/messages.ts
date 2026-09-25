"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { normaliseUrl } from "@/lib/format";
import { withinBurst } from "@/lib/security/burst";
import {
  cleanFileName,
  DM_BUCKET,
  DM_FILES_BUCKET,
  DM_IMAGES_BUCKET,
  MAX_DM_FILE_BYTES,
  MAX_DM_IMAGE_BYTES,
  MAX_DM_MEDIA_BYTES,
  MAX_DM_TEXT_CHARS,
  MAX_DM_VIDEO_BYTES,
  matchesSignature,
} from "@/lib/messages/shared";

/*
  Every direct message write.

  ONLY ASYNC FUNCTIONS AND TYPES ARE EXPORTED FROM THIS FILE. A "use server"
  module may export nothing else: a plain object arrives on the client as
  undefined and throws at runtime while passing tsc, eslint AND next build.
  That was shipped twice in one session on the community actions, so it is
  written at the top of this one rather than learned a third time.

  What the database enforces regardless of anything here:

  - dm_messages_insert_own requires sender_id = auth.uid(), an active account
    and participation in the thread. A forged thread_id gets 42501.
  - dm_messages_shape_ok requires each kind to carry what it claims: a text
    with no body, or a voice with no media, is refused by the CHECK.
  - dm_participants has NO insert grant or policy at all. dm_start_thread is
    the only way a participant row is ever written, and it is SECURITY DEFINER.
  - The dm-media bucket is PRIVATE and its storage policy requires the second
    path segment to be the caller's own id, so nobody uploads as somebody else.
*/

export type SendState = {
  status: "idle" | "error";
  message: string;
  /* Echoed so a refused message keeps what was typed. The form is keyed on
     this, because React 19 resets a form once its action completes and a
     mounted input ignores a changed defaultValue. */
  body: string;
  attempt: number;
};

const uuid = z.string().uuid();

/* Mirrors dm_messages_shape_ok. The CHECK is the control; these are the
   readable messages. */
const sendSchema = z
  .object({
    threadId: uuid,
    kind: z.enum(["text", "voice", "link", "video", "file", "image"]),
    body: z
      .string()
      .trim()
      .max(MAX_DM_TEXT_CHARS, `That is over ${MAX_DM_TEXT_CHARS.toLocaleString("en")} characters. Send it as a .txt file instead.`)
      .optional(),
    linkUrl: z
      .string()
      .trim()
      .max(2048)
      .regex(/^https?:\/\/\S+$/, "A link has to start with http:// or https://")
      .optional()
      .or(z.literal("")),
    mediaPath: z.string().trim().max(1024).optional().or(z.literal("")),
    fileName: z.string().trim().max(255).optional().or(z.literal("")),
    durationSeconds: z.number().int().min(1).max(600).nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "text" && !v.body) {
      ctx.addIssue({ code: "custom", message: "Write something first.", path: ["body"] });
    }
    if (v.kind === "link" && !v.linkUrl) {
      ctx.addIssue({ code: "custom", message: "Paste a link first.", path: ["linkUrl"] });
    }
    if ((v.kind === "voice" || v.kind === "video" || v.kind === "file" || v.kind === "image") && !v.mediaPath) {
      ctx.addIssue({ code: "custom", message: "That file did not attach.", path: ["mediaPath"] });
    }
  });

/*
  Start a thread with somebody, or open the one that already exists.

  The find-or-create is the RPC's job, not this file's: creating a thread
  writes a participant row for the OTHER person, and no insert policy could
  safely allow that from a client.
*/
export async function startThread(
  _prev: { status: "idle" | "error"; message: string },
  formData: FormData,
): Promise<{ status: "idle" | "error"; message: string }> {
  if (!isSupabaseConfigured()) return { status: "error", message: "Not connected." };

  const parsed = uuid.safeParse(formData.get("userId") ?? "");
  if (!parsed.success) return { status: "error", message: "Pick somebody first." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { status: "error", message: "Sign in first." };

  const { data, error } = await supabase.rpc("dm_start_thread", {
    p_other: parsed.data,
  });

  if (error) {
    console.error("[dm] start thread failed", error.code, error.message);
    if (error.code === "42501") {
      return { status: "error", message: "Your account cannot send messages right now." };
    }
    if (error.code === "P0003") {
      return {
        status: "error",
        message: "You can message friends only. Follow each other first.",
      };
    }
    return { status: "error", message: "Could not open that conversation." };
  }

  revalidatePath("/messages");
  /* Outside the error handling, because redirect throws by design. */
  redirect(`/messages/${data as string}`);
}

export async function sendMessage(
  prev: SendState,
  formData: FormData,
): Promise<SendState> {
  const body = String(formData.get("body") ?? "");

  const fail = (message: string): SendState => ({
    status: "error",
    message,
    body,
    attempt: prev.attempt + 1,
  });

  if (!isSupabaseConfigured()) return fail("Not connected.");

  const rawDuration = String(formData.get("durationSeconds") ?? "");

  const parsed = sendSchema.safeParse({
    threadId: formData.get("threadId") ?? "",
    kind: formData.get("kind") ?? "text",
    body: body.trim() ? body : undefined,
    /* "celpare.com" becomes a link rather than a refusal. */
    linkUrl: normaliseUrl(String(formData.get("linkUrl") ?? "")),
    mediaPath: String(formData.get("mediaPath") ?? ""),
    fileName: String(formData.get("fileName") ?? ""),
    durationSeconds: rawDuration ? Number(rawDuration) : null,
  });

  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "That did not send.");
  }

  const supabase = await createClient();
  /* Who is sending and the per minute cap on sending (as well as the
     database's daily cap on files), asked at the same time: they do not
     depend on each other, and each is a round trip. */
  const [
    {
      data: { user },
    },
    withinLimit,
  ] = await Promise.all([supabase.auth.getUser(), withinBurst("dm_send")]);

  if (!user) return fail("Sign in first.");

  const { kind, threadId, mediaPath, linkUrl, durationSeconds } = parsed.data;

  if (!withinLimit) {
    return fail("You are sending too fast. Wait a moment and try again.");
  }

  /*
    THE CONTROL ON UPLOADED MEDIA. The storage policy already stops a write
    into somebody else's folder. This stops a path being CLAIMED that the
    caller never uploaded: it must live under this thread and under this
    sender. Without it, a participant could point a message at any object in
    the bucket, including one from a different thread they are also in.
  */
  if (mediaPath) {
    const expected = `${threadId}/${user.id}/`;
    if (!mediaPath.startsWith(expected) || mediaPath.includes("..")) {
      return fail("That file is not yours to send.");
    }
  }

  /*
    AN IMAGE, A VIDEO OR A VOICE NOTE (4BB). Exact path shape in this sender's
    folder of this thread, then the object's real size against its limit and its
    first 16 bytes against its format's signature (verifyMediaHead). A program
    renamed photo.jpg is refused here. Nothing is decoded, resized or run.
  */
  if (kind === "image" || kind === "video" || kind === "voice") {
    const rule = MEDIA_RULES[kind];
    const folder = `${threadId}/${user.id}/`;
    const path = mediaPath ?? "";
    const m = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.([a-z0-9]{2,4})$/.exec(
      path.slice(folder.length),
    );
    if (!path.startsWith(folder) || !m || !(rule.exts as readonly string[]).includes(m[1])) {
      return fail(rule.wrongType);
    }
    const verdict = await verifyMediaHead(supabase, rule.bucket, path, m[1], rule.maxBytes);
    if (!verdict.ok) return fail(verdict.message);
  }

  /*
    A TXT OR CSV ATTACHMENT (4BA). Accepted only when every one of these holds,
    and the database re-checks the name, size and path shape in
    dm_messages_file_ok regardless:
      - the path is <this thread>/<this sender>/<uuid>.txt|csv, nothing else;
      - the shown name cleans to a .txt or .csv name;
      - the bytes really are plain text (verifyPlainText below).
    The file itself is never executed, parsed, previewed or written anywhere by
    this server. It is read once, as bytes, to be checked, and then discarded.
  */
  let fileName: string | null = null;
  let fileSize: number | null = null;
  if (kind === "file") {
    const cleaned = cleanFileName(parsed.data.fileName ?? "");
    /* The folder by plain string comparison and the file part by a regex
       literal, so no escaping inside a template string can loosen the check. */
    const folder = `${threadId}/${user.id}/`;
    const path = mediaPath ?? "";
    const pathOk =
      path.startsWith(folder) &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(txt|csv)$/.test(
        path.slice(folder.length),
      );
    if (!cleaned || !pathOk) return fail("Only .txt and .csv files can be sent.");

    const verdict = await verifyPlainText(supabase, mediaPath as string);
    if (!verdict.ok) return fail(verdict.message);
    fileName = cleaned.name;
    fileSize = verdict.size;
  }

  const { error } = await supabase.from("dm_messages").insert({
    thread_id: threadId,
    sender_id: user.id,
    kind,
    body: kind === "text" || kind === "link" ? (parsed.data.body ?? null) : null,
    link_url: kind === "link" ? linkUrl || null : null,
    media_path:
      kind === "voice" || kind === "video" || kind === "file" || kind === "image"
        ? mediaPath || null
        : null,
    duration_seconds: kind === "voice" ? durationSeconds : null,
    file_name: fileName,
    file_size: fileSize,
  });

  if (error) {
    console.error("[dm] send failed", error.code, error.message);
    if (error.code === "42501") {
      return fail("Your account cannot send messages right now.");
    }
    if (error.code === "23514") {
      return fail("That message is missing something it needs.");
    }
    if (error.code === "P0004") {
      return fail("You have sent the most files allowed today. Try again tomorrow.");
    }
    return fail("Could not send. Try again.");
  }

  revalidatePath(`/messages/${threadId}`);
  revalidatePath("/messages");

  /* Cleared, not echoed: this one succeeded. */
  return { status: "idle", message: "", body: "", attempt: prev.attempt + 1 };
}

/* Stamp the read marker. Fire and forget from the thread page: a failure here
   costs an unread dot, not a message. */
export async function markThreadRead(threadId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  if (!uuid.safeParse(threadId).success) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from("dm_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("thread_id", threadId)
    .eq("user_id", user.id);

  if (error) console.error("[dm] mark read failed", error.code, error.message);
}

/*
  Retract your own message. Soft, always: 03-data-model.md forbids a hard
  delete of user content, and there is no DELETE policy or grant to make one
  possible.

  The uploaded file is deliberately left in the bucket. Deleting it here would
  be a second failure path in the middle of an action that has already
  succeeded, and the bucket is private, so an orphan is unreachable rather than
  exposed. Sweeping them is a retention job and is recorded as a gap.
*/
export async function deleteMessage(
  id: string,
  threadId: string,
): Promise<{ ok: boolean; message: string }> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Not connected." };
  if (!uuid.safeParse(id).success) return { ok: false, message: "That did not work." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Sign in first." };

  const { data, error } = await supabase
    .from("dm_messages")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("sender_id", user.id)
    .is("deleted_at", null)
    .select("id");

  if (error) {
    console.error("[dm] delete failed", error.code, error.message);
    return { ok: false, message: "Could not remove that." };
  }

  /* Zero rows means it was not theirs, or it was already gone. Reported as a
     no-op rather than as a success, which is the bug deleteConversation had
     before 4O.13. */
  if (!data || data.length === 0) {
    return { ok: false, message: "That is not yours to remove." };
  }

  revalidatePath(`/messages/${threadId}`);
  return { ok: true, message: "" };
}

/*
  Is the uploaded object genuinely plain text. The one place this server looks
  at a file's contents, and it looks at them only as bytes:

  - at most 1 MB, and not empty (the bucket's limit is 1 MB as well);
  - no NUL and no control bytes other than tab, newline and carriage return,
    which is what separates a text file from a binary renamed .txt;
  - valid UTF-8, decoded with fatal: true so a single bad sequence refuses it.

  Nothing is executed, evaluated, parsed as CSV, rendered or stored. The bytes
  go out of scope when this returns. Not exported: a "use server" module may
  export async functions only, and this must never be callable from a client.
*/
async function verifyPlainText(
  db: Awaited<ReturnType<typeof createClient>>,
  path: string,
): Promise<{ ok: true; size: number } | { ok: false; message: string }> {
  const { data, error } = await db.storage.from(DM_FILES_BUCKET).download(path);
  if (error || !data) {
    console.error("[dm] file check could not read the upload", error?.message);
    return { ok: false, message: "That file did not upload. Try again." };
  }
  if (data.size === 0 || data.size > MAX_DM_FILE_BYTES) {
    return { ok: false, message: "Files can be up to 1 MB." };
  }

  const bytes = new Uint8Array(await data.arrayBuffer());
  for (const b of bytes) {
    if ((b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) || b === 0x7f) {
      return { ok: false, message: "That is not a plain text file." };
    }
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, message: "That is not a plain text file." };
  }
  return { ok: true, size: bytes.length };
}

/* Where each media kind lives, what it may be, and how big (4BB). */
const MEDIA_RULES = {
  image: {
    bucket: DM_IMAGES_BUCKET,
    exts: ["jpg", "png", "webp"],
    maxBytes: MAX_DM_IMAGE_BYTES,
    wrongType: "Photos can be JPG, PNG or WebP.",
  },
  video: {
    bucket: DM_BUCKET,
    exts: ["mp4", "webm"],
    maxBytes: MAX_DM_VIDEO_BYTES,
    wrongType: "Videos can be MP4 or WebM.",
  },
  voice: {
    bucket: DM_BUCKET,
    exts: ["webm", "ogg", "m4a", "mp3"],
    maxBytes: MAX_DM_MEDIA_BYTES,
    wrongType: "That recording is not a format Celpare accepts.",
  },
} as const;

/*
  The real size and the first 16 bytes of an uploaded image, video or voice
  note, and nothing more. A short lived signed URL is fetched with a Range
  header, so a 25 MB video costs 16 bytes, not 25 MB; the total comes from
  Content-Range. The bytes are compared to a fixed signature and dropped.
  The URL is minted by our own client for our own bucket, so this cannot be
  pointed anywhere else.
*/
async function verifyMediaHead(
  db: Awaited<ReturnType<typeof createClient>>,
  bucket: string,
  path: string,
  ext: string,
  maxBytes: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: signed, error } = await db.storage.from(bucket).createSignedUrl(path, 60);
  if (error || !signed?.signedUrl) {
    console.error("[dm] media check could not sign", error?.message);
    return { ok: false, message: "That did not upload. Try again." };
  }

  /*
    BOUNDED, AND NEVER WAITING ON A CANCEL (2026-09-25). A voice note hung the
    send forever with no error: this check awaited reader.cancel(), and a
    cancelled branch of a teed body (Next's patched fetch tees responses) only
    settles when the other branch does. Now the fetch and the first read share
    a 10 second limit, and the rest of the body is cancelled without waiting,
    so a stall becomes a readable error instead of a spinner.
  */
  const signal = AbortSignal.timeout(10_000);
  let res: Response;
  try {
    res = await fetch(signed.signedUrl, {
      headers: { Range: "bytes=0-15" },
      cache: "no-store",
      signal,
    });
  } catch (err) {
    console.error("[dm] media check fetch failed", err);
    return { ok: false, message: "That did not upload. Try again." };
  }
  if (!res.ok || !res.body) {
    return { ok: false, message: "That did not upload. Try again." };
  }

  /* 206 carries "bytes 0-15/<total>"; a 200 means no range support, where the
     length header is the total. Either way only the first chunk is read. */
  const range = res.headers.get("content-range");
  const total = range
    ? Number(range.split("/")[1])
    : Number(res.headers.get("content-length") ?? NaN);

  const reader = res.body.getReader();
  let first: ReadableStreamReadResult<Uint8Array>;
  try {
    first = await reader.read();
  } catch (err) {
    console.error("[dm] media check read failed", err);
    return { ok: false, message: "That did not upload. Try again." };
  }
  void reader.cancel().catch(() => {});
  const head = (first.value ?? new Uint8Array()).slice(0, 16);

  if (!Number.isFinite(total) || total <= 0) {
    return { ok: false, message: "That did not upload. Try again." };
  }
  if (total > maxBytes) {
    return {
      ok: false,
      message: `That is over the ${Math.round(maxBytes / (1024 * 1024))} MB limit.`,
    };
  }
  if (!matchesSignature(ext, head)) {
    return { ok: false, message: "That file is not what its name says, so it was not sent." };
  }
  return { ok: true };
}
