"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { MAX_POST_IMAGES, isOwnPostUpload } from "@/lib/community/media";
import { POST_KINDS } from "@/lib/community/kinds";
import { normaliseUrl } from "@/lib/format";

/*
  Every community write. Same doctrine as follow.ts and settings.ts: a zod
  allowlist on the way in, hardcoded column literals on the way out, getUser
  rather than getSession, and the database as the actual control.

  What the database enforces regardless of anything here:

  - posts_insert_own and comments_insert_own both call is_active_account(), so
    a suspended person cannot publish. Note that UPDATE is deliberately left
    open to the owner (D78), which is why the soft deletes below do not test
    suspension either: a suspended person retracting their own post is the
    behaviour that was wanted, not a hole.
  - The composite primary keys on likes and saves make a double tap idempotent.
    A 23505 from an insert is the outcome that was asked for, not a failure.
  - reports has UNIQUE (reporter_id, entity_type, entity_id), so nobody can
    trip the auto hide threshold alone.
  - tg_reports_count does the hiding, counts only qualified reporters (D73) and
    reads its threshold from community_settings. None of that is repeated here,
    and this file must never try to write a status.
*/

/*
  NOTHING BUT ASYNC FUNCTIONS IS EXPORTED FROM THIS FILE, AND THAT IS A RULE OF
  THE FRAMEWORK RATHER THAN A STYLE CHOICE.

  A "use server" module may only export async functions. An exported plain
  object does not survive the boundary: it arrives on the client as undefined,
  which threw "Cannot read properties of undefined (reading 'body')" and a real
  500 on /community/new the first time this was run. tsc and eslint were both
  clean, because the type is perfectly valid on both sides. Same family as the
  lucide icon that could not cross the boundary in 4AB.

  So the initial state for each useActionState lives at its call site, which is
  the convention follow-button.tsx already set. Only the TYPES are exported
  from here, and a type import is erased at compile time.
*/

/* ---------------------------------------------------------------- posting */

export type ComposerState = {
  status: "idle" | "error";
  message: string;
  /* Echoed back so a refused post does not lose what was typed. React 19
     resets a form once its action completes, so the form is keyed on `attempt`
     and remounts with these as defaults. Learned in 4S.2. */
  values: {
    body: string;
    linkUrl: string;
    topicId: string;
    kind: string;
    toolId: string;
    modelId: string;
  };
  attempt: number;
};


/* Mirrors posts_body_len and posts_link_url_ok exactly. The CHECK is the
   control; this is the readable message. */
const postSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write something first.")
    .max(2000, "A post is 2000 characters at most."),
  linkUrl: z
    .string()
    .trim()
    .max(2048, "That link is too long.")
    .regex(/^https?:\/\/\S+$/, "A link has to start with http:// or https://")
    .optional()
    .or(z.literal("")),
  topicId: z.string().uuid().optional().or(z.literal("")),
  /* Every value the column accepts, including the derived ones: createPost
     sets image, video and link itself, so they must pass validation even
     though the composer never offers them. */
  kind: z.enum(POST_KINDS),
  toolId: z.string().uuid().optional().or(z.literal("")),
  modelId: z.string().uuid().optional().or(z.literal("")),
  /* The honeypot. Same shape as demo.ts. */
  website: z.string().max(0).optional().or(z.literal("")),
});

/*
  One media row as it arrives from the composer's hidden inputs.

  The URL is checked against isOwnPostUpload before any of this reaches the
  database, so a typed URL, somebody else's upload, or a file in the tool
  buckets is all refused the same way.
*/
const mediaSchema = z.object({
  url: z.string().url().max(2048),
  kind: z.enum(["image", "video"]),
  width: z.number().int().positive().max(20000).nullable(),
  height: z.number().int().positive().max(20000).nullable(),
});

export async function createPost(
  prev: ComposerState,
  formData: FormData,
): Promise<ComposerState> {
  const values = {
    body: String(formData.get("body") ?? ""),
    /* Normalised before validation, so "celpare.com" is a link rather than a
       refusal. See normaliseUrl for why the input is no longer type="url". */
    linkUrl: normaliseUrl(String(formData.get("linkUrl") ?? "")),
    topicId: String(formData.get("topicId") ?? ""),
    kind: String(formData.get("kind") ?? "text"),
    toolId: String(formData.get("toolId") ?? ""),
    modelId: String(formData.get("modelId") ?? ""),
  };

  const fail = (message: string): ComposerState => ({
    status: "error",
    message,
    values,
    attempt: prev.attempt + 1,
  });

  if (!isSupabaseConfigured()) return fail("Not connected.");

  const parsed = postSchema.safeParse({
    ...values,
    website: formData.get("website") ?? "",
  });

  if (!parsed.success) {
    /* A honeypot hit is told nothing. It is sent to the feed as though it
       worked, which is what demo.ts does and for the same reason: a bot that
       learns it was caught tries again differently. */
    if (parsed.error.issues.some((i) => i.path[0] === "website")) {
      redirect("/community");
    }
    return fail(parsed.error.issues[0]?.message ?? "That did not work.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return fail("Sign in to post.");

  /*
    The media, read back from the repeated hidden inputs the uploader wrote.
    getAll() preserves DOM order, which is the order they are shown in.
  */
  const urls = formData.getAll("mediaUrl").map(String);
  const kinds = formData.getAll("mediaKind").map(String);
  const widths = formData.getAll("mediaWidth").map(String);
  const heights = formData.getAll("mediaHeight").map(String);

  const media: { url: string; kind: "image" | "video"; width: number | null; height: number | null }[] =
    [];

  for (let i = 0; i < urls.length; i += 1) {
    const candidate = mediaSchema.safeParse({
      url: urls[i] ?? "",
      kind: kinds[i] ?? "",
      width: widths[i] ? Number(widths[i]) : null,
      height: heights[i] ? Number(heights[i]) : null,
    });

    if (!candidate.success) return fail("One of those files did not attach.");

    /*
      THE CONTROL. Not the uploader, which is a client component and can be
      bypassed entirely, and not the shape check above, which only says it is a
      URL. This says the file is an upload THIS person made into a POST bucket.
      It refuses a URL somebody typed, somebody else's upload, and anything in
      tool-images or tool-videos, so a post cannot reach into media a review
      process put there.
    */
    if (!isOwnPostUpload(candidate.data.url, user.id)) {
      return fail("One of those files is not yours to attach.");
    }

    media.push(candidate.data);
  }

  const videos = media.filter((m) => m.kind === "video").length;
  const images = media.length - videos;

  /* Mirrors tg_post_media_cap so the person is told before a post is written
     rather than after. The trigger is still the control. */
  if (videos > 1 || (videos === 1 && images > 0)) {
    return fail("A post carries one video and nothing else.");
  }
  if (images > MAX_POST_IMAGES) {
    return fail(`A post carries up to ${MAX_POST_IMAGES} images.`);
  }

  /*
    The kind is corrected rather than trusted when media is present and the
    author left it at the default. A post carrying a video says video. It is
    never corrected AWAY from a deliberate choice like launch or question,
    because those say something media cannot.
  */
  let kind: string = parsed.data.kind;
  if (kind === "text" && videos > 0) kind = "video";
  else if (kind === "text" && images > 0) kind = "image";
  else if (kind === "text" && parsed.data.linkUrl) kind = "link";

  /* posts_kind_matches_attachment enforces both of these. Clearing the
     attachment that does not belong to the chosen kind keeps a stray value
     from a previous selection out of the row. */
  const toolId = kind === "tool" ? parsed.data.toolId : "";
  const modelId = kind === "model" ? parsed.data.modelId : "";

  if (kind === "tool" && !toolId) return fail("Pick the tool this post is about.");
  if (kind === "model" && !modelId) return fail("Pick the model this post is about.");

  const { data, error } = await supabase
    .from("posts")
    .insert({
      author_id: user.id,
      body: parsed.data.body,
      link_url: parsed.data.linkUrl ? parsed.data.linkUrl : null,
      topic_id: parsed.data.topicId ? parsed.data.topicId : null,
      kind,
      tool_id: toolId ? toolId : null,
      model_id: modelId ? modelId : null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[community] post insert failed", error.code, error.message);
    /* 42501 here means is_active_account() refused, which is a suspension and
       is worth saying plainly rather than as "could not post". */
    if (error.code === "42501") {
      return fail("Your account cannot post right now. Check your account notice.");
    }
    if (error.code === "23514") {
      return fail("That combination is not allowed. Check the kind and the attachment.");
    }
    return fail("Could not post. Try again.");
  }

  const postId = (data as { id: string }).id;

  if (media.length > 0) {
    const { error: mediaError } = await supabase.from("post_media").insert(
      media.map((m, i) => ({
        post_id: postId,
        media_kind: m.kind,
        url: m.url,
        width: m.width,
        height: m.height,
        sort_order: i,
      })),
    );

    /*
      The post already exists at this point. Rather than leave a post whose
      pictures silently vanished, it is soft deleted and the person is told, so
      they can try again with everything they wrote still in the form. There is
      no transaction across two PostgREST calls to do this properly, and an RPC
      that wrote both would be the real fix if this ever misbehaves.
    */
    if (mediaError) {
      console.error("[community] post media failed", mediaError.code, mediaError.message);
      await supabase
        .from("posts")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", postId)
        .eq("author_id", user.id);
      return fail("Those files did not attach, so the post was not published.");
    }
  }

  revalidatePath("/community");
  revalidatePath("/profile");

  /* Outside the try, because redirect throws by design. */
  redirect(`/community/${postId}`);
}

/* --------------------------------------------------------------- comments */

export type CommentState = {
  status: "idle" | "error";
  message: string;
  body: string;
  attempt: number;
};

const commentSchema = z.object({
  postId: z.string().uuid(),
  body: z
    .string()
    .trim()
    .min(1, "Write something first.")
    .max(1000, "A comment is 1000 characters at most."),
  website: z.string().max(0).optional().or(z.literal("")),
});

export async function createComment(
  prev: CommentState,
  formData: FormData,
): Promise<CommentState> {
  const body = String(formData.get("body") ?? "");

  const fail = (message: string): CommentState => ({
    status: "error",
    message,
    body,
    attempt: prev.attempt + 1,
  });

  if (!isSupabaseConfigured()) return fail("Not connected.");

  const parsed = commentSchema.safeParse({
    postId: formData.get("postId") ?? "",
    body,
    website: formData.get("website") ?? "",
  });

  if (!parsed.success) {
    if (parsed.error.issues.some((i) => i.path[0] === "website")) {
      return { status: "idle", message: "", body: "", attempt: prev.attempt + 1 };
    }
    return fail(parsed.error.issues[0]?.message ?? "That did not work.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return fail("Sign in to comment.");

  const { error } = await supabase.from("comments").insert({
    post_id: parsed.data.postId,
    author_id: user.id,
    body: parsed.data.body,
  });

  if (error) {
    console.error("[community] comment insert failed", error.code, error.message);
    if (error.code === "42501") {
      return fail("Your account cannot comment right now, or that post is gone.");
    }
    return fail("Could not comment. Try again.");
  }

  revalidatePath(`/community/${parsed.data.postId}`);
  revalidatePath("/community");

  /* Cleared, not echoed: this one succeeded. */
  return { status: "idle", message: "", body: "", attempt: prev.attempt + 1 };
}

/* --------------------------------------------------- likes, saves, reposts */

export type ToggleResult = { ok: boolean; on: boolean; message: string };

const toggleSchema = z.object({
  entityType: z.enum(["post", "comment"]),
  entityId: z.string().uuid(),
  on: z.boolean(),
});

/*
  Like and unlike, for a post or a comment.

  Called from a client component rather than from a form action, because the
  UI is optimistic: it has already moved, and this either confirms it or the
  caller rolls it back. Nothing here revalidates the whole feed, which would
  throw away the optimistic state and make the count flicker.
*/
export async function toggleLike(
  entityType: "post" | "comment",
  entityId: string,
  on: boolean,
): Promise<ToggleResult> {
  if (!isSupabaseConfigured()) return { ok: false, on: !on, message: "Not connected." };

  const parsed = toggleSchema.safeParse({ entityType, entityId, on });
  if (!parsed.success) return { ok: false, on: !on, message: "That did not work." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, on: false, message: "Sign in to like." };

  if (parsed.data.on) {
    const { error } = await supabase.from("likes").insert({
      user_id: user.id,
      entity_type: parsed.data.entityType,
      entity_id: parsed.data.entityId,
    });
    /* 23505 is the composite primary key doing its job. Already liked is the
       state that was wanted, so this is a success. */
    if (error && error.code !== "23505") {
      console.error("[community] like failed", error.code, error.message);
      return { ok: false, on: false, message: "Could not like that." };
    }
  } else {
    const { error } = await supabase
      .from("likes")
      .delete()
      .eq("user_id", user.id)
      .eq("entity_type", parsed.data.entityType)
      .eq("entity_id", parsed.data.entityId);

    if (error) {
      console.error("[community] unlike failed", error.code, error.message);
      return { ok: false, on: true, message: "Could not undo that." };
    }
  }

  return { ok: true, on: parsed.data.on, message: "" };
}

/*
  Save and unsave. Posts only: saves_entity_type_ok is a CHECK for exactly
  'post', so the entity type is not a parameter here.

  A save is private. There is no cross user select policy on the table at all,
  so a save count on a post row is the only thing anybody else ever sees.
*/
export async function toggleSave(
  postId: string,
  on: boolean,
): Promise<ToggleResult> {
  if (!isSupabaseConfigured()) return { ok: false, on: !on, message: "Not connected." };

  const parsed = z
    .object({ postId: z.string().uuid(), on: z.boolean() })
    .safeParse({ postId, on });
  if (!parsed.success) return { ok: false, on: !on, message: "That did not work." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, on: false, message: "Sign in to save." };

  if (parsed.data.on) {
    const { error } = await supabase.from("saves").insert({
      user_id: user.id,
      entity_type: "post",
      entity_id: parsed.data.postId,
    });
    if (error && error.code !== "23505") {
      console.error("[community] save failed", error.code, error.message);
      return { ok: false, on: false, message: "Could not save that." };
    }
  } else {
    const { error } = await supabase
      .from("saves")
      .delete()
      .eq("user_id", user.id)
      .eq("entity_type", "post")
      .eq("entity_id", parsed.data.postId);

    if (error) {
      console.error("[community] unsave failed", error.code, error.message);
      return { ok: false, on: true, message: "Could not undo that." };
    }
  }

  return { ok: true, on: parsed.data.on, message: "" };
}

/* ---------------------------------------------------------------- reports */

export type ReportState = { status: "idle" | "success" | "error"; message: string };

/* The list is reports_reason_check, not the shorter one in the spec: the
   constraint grew when the admin queue was built and the constraint is what
   is true. */
const reportSchema = z.object({
  entityType: z.enum(["post", "comment"]),
  entityId: z.string().uuid(),
  reason: z.enum([
    "spam",
    "abuse",
    "harassment",
    "offtopic",
    "illegal",
    "security",
    "other",
  ]),
  note: z.string().trim().max(500, "Keep the note under 500 characters.").optional(),
});

export async function reportItem(
  _prev: ReportState,
  formData: FormData,
): Promise<ReportState> {
  if (!isSupabaseConfigured()) return { status: "error", message: "Not connected." };

  const parsed = reportSchema.safeParse({
    entityType: formData.get("entityType") ?? "",
    entityId: formData.get("entityId") ?? "",
    reason: formData.get("reason") ?? "",
    note: String(formData.get("note") ?? ""),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Pick a reason first.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { status: "error", message: "Sign in to report." };

  const { error } = await supabase.from("reports").insert({
    reporter_id: user.id,
    entity_type: parsed.data.entityType,
    entity_id: parsed.data.entityId,
    reason: parsed.data.reason,
    note: parsed.data.note ? parsed.data.note : null,
  });

  if (error) {
    /* The unique constraint. Reporting the same thing twice is not an error
       worth an apology: it is already reported, which is what they wanted. */
    if (error.code === "23505") {
      return { status: "success", message: "You have already reported this." };
    }
    console.error("[community] report failed", error.code, error.message);
    return { status: "error", message: "Could not send that report." };
  }

  return {
    status: "success",
    message: "Reported. A moderator will look at it.",
  };
}

/* ------------------------------------------------------------ soft delete */

/*
  Never a hard delete. 03-data-model.md requires it and there is no DELETE
  policy or grant on posts or comments, so a hard delete is refused by the
  database as well as by this code.

  WHY THIS DOES NOT NEED THE TRICK conversations NEEDED. Stamping deleted_at
  is an UPDATE, and PostgreSQL applies the table's SELECT policy to the new row
  as well as the write policies. That is exactly what made deleting a chat
  impossible until 4O.13, because conversations_own required deleted_at is null
  to see a row at all. posts_select_auth and comments_select_auth each carry
  `OR auth.uid() = author_id` with no deleted_at condition on that branch, so
  the author can still see their own stamped row and the update is allowed.
  Verified live rather than read off the policy text.
*/
async function softDelete(
  table: "posts" | "comments",
  id: string,
): Promise<{ ok: boolean; message: string }> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Not connected." };

  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, message: "That did not work." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, message: "Sign in first." };

  /* author_id is in the predicate as well as in the policy. Belt and braces,
     and it makes the returned row count mean "yours was deleted" rather than
     "something was". */
  const { data, error } = await supabase
    .from(table)
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("author_id", user.id)
    .is("deleted_at", null)
    .select("id");

  if (error) {
    console.error(`[community] ${table} delete failed`, error.code, error.message);
    return { ok: false, message: "Could not delete that." };
  }

  /* Zero rows means it was not theirs, or it was already gone. Reported as a
     no-op rather than as a success, which is the bug deleteConversation had
     before 4O.13. */
  if (!data || data.length === 0) {
    return { ok: false, message: "That is not yours to delete." };
  }

  return { ok: true, message: "" };
}

export async function deletePost(id: string): Promise<{ ok: boolean; message: string }> {
  const result = await softDelete("posts", id);
  if (result.ok) {
    revalidatePath("/community");
    revalidatePath("/profile");
  }
  return result;
}

export async function deleteComment(
  id: string,
  postId: string,
): Promise<{ ok: boolean; message: string }> {
  const result = await softDelete("comments", id);
  if (result.ok) {
    revalidatePath(`/community/${postId}`);
    revalidatePath("/community");
  }
  return result;
}
