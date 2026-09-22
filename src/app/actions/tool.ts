"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

/*
  What a signed in person can do to a tool: react, save, review, report.

  The doctrine from developer.ts and admin.ts holds. Nothing here decides who
  may act; the database does:

    - one reaction per person is the PRIMARY KEY of tool_reactions
    - one review per person is a UNIQUE constraint on tool_reviews
    - one report per person is reports_one_per_user, which already existed
    - user_id is in no insert grant and is stamped by a trigger
    - a suspended account fails is_active_account() in the WITH CHECK

  So a forged request, a double click and a race all land on the same refusal.
  These functions turn that refusal into a sentence.
*/

export type ToolState = {
  status: "idle" | "success" | "error";
  message: string;
};

const uuid = z.string().uuid();

async function session() {
  if (!isSupabaseConfigured()) return null;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  return { db, user };
}

const SIGN_IN: ToolState = {
  status: "error",
  message: "Sign in to do that.",
};

function refused(error: { code?: string; message: string }): ToolState {
  if (error.code === "42501" || error.message.includes("row-level security")) {
    return { status: "error", message: "Your account cannot do that right now." };
  }
  if (error.code === "23505") {
    return { status: "error", message: "You have already done that." };
  }
  console.error("[tool] write failed", error.code, error.message);
  return { status: "error", message: "That did not save. Try again." };
}

/* ------------------------------------------------------------- like/dislike */

/*
  One row per person per tool, holding a like or a dislike.

  Pressing the side you are already on removes the row, which is what a toggle
  means. Pressing the other side REPLACES the value rather than adding a row,
  so the two can never both be true for one person.
*/
export async function reactToTool(_prev: ToolState, formData: FormData): Promise<ToolState> {
  const parsed = z.object({ toolId: uuid, slug: z.string().min(1), value: z.enum(["1", "-1"]) })
    .safeParse({
      toolId: formData.get("toolId"),
      slug: formData.get("slug"),
      value: formData.get("value"),
    });
  if (!parsed.success) return { status: "error", message: "That did not work." };

  const s = await session();
  if (!s) return SIGN_IN;

  const { toolId, slug } = parsed.data;
  const value = Number(parsed.data.value) as 1 | -1;

  const { data: existing } = await s.db
    .from("tool_reactions").select("value").eq("tool_id", toolId).maybeSingle();

  if (existing?.value === value) {
    const { error } = await s.db.from("tool_reactions").delete().eq("tool_id", toolId);
    if (error) return refused(error);
    revalidatePath(`/tools/${slug}`);
    return { status: "success", message: "" };
  }

  const { error } = existing
    ? await s.db.from("tool_reactions").update({ value }).eq("tool_id", toolId)
    : await s.db.from("tool_reactions").insert({ tool_id: toolId, value });

  if (error) return refused(error);
  revalidatePath(`/tools/${slug}`);
  return { status: "success", message: "" };
}

/* -------------------------------------------------------------------- save */

/*
  THE DIRECT SAVE ACTIONS ARE GONE, 2026-09-21.

  Saving means filing into a collection now, and the database mirrors that
  membership into the saved tables (tg_mirror_collection_save). An endpoint that
  writes those tables directly would put a row there that belongs to no
  collection, which the mirror would then never correct: the two would disagree
  and the collection, which is the source of truth, would be the one that looked
  wrong.

  Every exported server action is a public endpoint whether or not anything calls
  it, so these were deleted rather than left unreferenced.
*/

/* ------------------------------------------------------------ rate + review */

const reviewSchema = z.object({
  toolId: uuid,
  slug: z.string().min(1),
  rating: z.coerce.number().int().min(1, "Choose a rating from 1 to 5.").max(5),
  body: z.string().trim().max(2000, "Keep a review under 2000 characters.").optional(),
});

/*
  A rating and an optional review, together, because a star with no sentence is
  still a judgement somebody should be able to explain.

  Updating your own is allowed and replaces it. That is one opinion per person
  changing its mind, not two opinions, and the unique constraint is what makes
  the difference enforceable rather than hoped for.
*/
export async function reviewTool(_prev: ToolState, formData: FormData): Promise<ToolState> {
  const parsed = reviewSchema.safeParse({
    toolId: formData.get("toolId"),
    slug: formData.get("slug"),
    rating: formData.get("rating"),
    body: formData.get("body") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const s = await session();
  if (!s) return SIGN_IN;

  const { toolId, slug, rating } = parsed.data;
  const body = (parsed.data.body ?? "").trim() || null;

  const { data: existing } = await s.db
    .from("tool_reviews").select("id").eq("tool_id", toolId).eq("user_id", s.user.id).maybeSingle();

  const { error } = existing
    ? await s.db.from("tool_reviews").update({ rating, body }).eq("id", existing.id)
    : await s.db.from("tool_reviews").insert({ tool_id: toolId, rating, body });

  if (error) return refused(error);
  revalidatePath(`/tools/${slug}`);
  return { status: "success", message: existing ? "Your review was updated." : "Thanks, your review is live." };
}

export async function deleteReview(_prev: ToolState, formData: FormData): Promise<ToolState> {
  const parsed = z.object({ reviewId: uuid, slug: z.string().min(1) })
    .safeParse({ reviewId: formData.get("reviewId"), slug: formData.get("slug") });
  if (!parsed.success) return { status: "error", message: "That did not work." };

  const s = await session();
  if (!s) return SIGN_IN;

  // RLS allows a delete only where user_id = auth.uid(), so this needs no
  // ownership check of its own. A row that is not yours matches nothing.
  const { error } = await s.db.from("tool_reviews").delete().eq("id", parsed.data.reviewId);
  if (error) return refused(error);

  revalidatePath(`/tools/${parsed.data.slug}`);
  return { status: "success", message: "Your review was removed." };
}

/* ------------------------------------------------------------------ report */

const REASONS = ["spam", "abuse", "harassment", "offtopic", "illegal", "security", "other"] as const;

/*
  Goes into the existing reports table, which already accepted
  entity_type = 'tool' before this page existed. No second report system, and
  the admin queue at /admin/reports picks it up with no change.
*/
export async function reportTool(_prev: ToolState, formData: FormData): Promise<ToolState> {
  const parsed = z.object({
    toolId: uuid,
    slug: z.string().min(1),
    reason: z.enum(REASONS),
    note: z.string().trim().max(500, "Keep the note under 500 characters.").optional(),
  }).safeParse({
    toolId: formData.get("toolId"),
    slug: formData.get("slug"),
    reason: formData.get("reason"),
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Pick a reason." };
  }

  const s = await session();
  if (!s) return SIGN_IN;

  const { error } = await s.db.from("reports").insert({
    reporter_id: s.user.id,
    entity_type: "tool",
    entity_id: parsed.data.toolId,
    reason: parsed.data.reason,
    note: (parsed.data.note ?? "").trim() || null,
  });

  if (error) {
    if (error.code === "23505") {
      return { status: "success", message: "You have already reported this. It is with Celpare." };
    }
    return refused(error);
  }

  revalidatePath(`/tools/${parsed.data.slug}`);
  return { status: "success", message: "Reported. Celpare will look at it." };
}
