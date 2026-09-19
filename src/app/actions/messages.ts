"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { normaliseUrl } from "@/lib/format";

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
    kind: z.enum(["text", "voice", "link", "video"]),
    body: z.string().trim().max(4000, "That is over 4000 characters.").optional(),
    linkUrl: z
      .string()
      .trim()
      .max(2048)
      .regex(/^https?:\/\/\S+$/, "A link has to start with http:// or https://")
      .optional()
      .or(z.literal("")),
    mediaPath: z.string().trim().max(1024).optional().or(z.literal("")),
    durationSeconds: z.number().int().min(1).max(600).nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "text" && !v.body) {
      ctx.addIssue({ code: "custom", message: "Write something first.", path: ["body"] });
    }
    if (v.kind === "link" && !v.linkUrl) {
      ctx.addIssue({ code: "custom", message: "Paste a link first.", path: ["linkUrl"] });
    }
    if ((v.kind === "voice" || v.kind === "video") && !v.mediaPath) {
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
    durationSeconds: rawDuration ? Number(rawDuration) : null,
  });

  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "That did not send.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return fail("Sign in first.");

  const { kind, threadId, mediaPath, linkUrl, durationSeconds } = parsed.data;

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

  const { error } = await supabase.from("dm_messages").insert({
    thread_id: threadId,
    sender_id: user.id,
    kind,
    body: kind === "text" || kind === "link" ? (parsed.data.body ?? null) : null,
    link_url: kind === "link" ? linkUrl || null : null,
    media_path: kind === "voice" || kind === "video" ? mediaPath || null : null,
    duration_seconds: kind === "voice" ? durationSeconds : null,
  });

  if (error) {
    console.error("[dm] send failed", error.code, error.message);
    if (error.code === "42501") {
      return fail("Your account cannot send messages right now.");
    }
    if (error.code === "23514") {
      return fail("That message is missing something it needs.");
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
