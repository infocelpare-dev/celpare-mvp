"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  NO_TARGETS,
  type CollectionRow,
  type SaveEntity,
  type SaveResult,
  type SaveTargets,
} from "@/lib/collections/types";

/*
  Save, and where to.

  EVERY EXPORT HERE IS A PUBLIC ENDPOINT. A server action is a POST anybody can
  send, so none of these trusts its arguments: the ids are parsed by zod, the
  entity kind is a closed list, and the write itself goes through an RPC that runs
  as the CALLER, under uc_insert_own, uci_insert_own and the plan cap trigger.
  Nothing here uses the service role, because every row involved belongs to the
  person making the request.

  NOTHING IS WRITTEN WHEN THE PICKER OPENS. Founder decision 2026-09-21: tapping
  Save opens the picker and the item is saved only when a row is toggled. So
  loadSaveTargets is a pure read, and closing the modal without touching anything
  leaves the world exactly as it was.
*/

const entity = z.enum(["tool", "model", "post"]);
const uuid = z.string().uuid();

const REFUSED: SaveResult = {
  status: "error",
  message: "Sign in to save things.",
};

async function session() {
  if (!isSupabaseConfigured()) return null;
  const db = await createClient();
  /* getUser, not getSession, per D21. */
  const {
    data: { user },
  } = await db.auth.getUser();
  return user ? { db, user } : null;
}

/*
  Turn a database refusal into a sentence.

  The plan cap raises `plan_limit_reached:collections:1`, which is precise and
  unreadable. The number is taken FROM THE ERROR rather than from a copy in this
  file, so the message cannot claim a limit different from the one enforced.
*/
function explain(error: { message: string; code?: string }): SaveResult {
  const cap = /plan_limit_reached:collections:(\d+)/.exec(error.message);
  if (cap) {
    return {
      status: "error",
      message:
        cap[1] === "1"
          ? "Your plan includes one collection. Upgrade for more."
          : `Your plan includes ${cap[1]} collections.`,
    };
  }
  if (/plan_limit_reached:saved_(tools|models):(\d+)/.test(error.message)) {
    const n = /:(\d+)$/.exec(error.message)?.[1] ?? "";
    return {
      status: "error",
      message: `You have saved ${n} items, which is this plan's limit.`,
    };
  }
  if (error.message.includes("uc_name_unique_per_user")) {
    return { status: "error", message: "You already have a collection with that name." };
  }
  if (error.message.includes("uc_item_count_ok")) {
    return { status: "error", message: "That collection is full." };
  }
  if (error.code === "42501" || error.message.includes("not_authorised")) {
    return REFUSED;
  }
  console.error("[collections] refused", error.code, error.message);
  return { status: "error", message: "That did not go through. Try again." };
}

/* ---------------------------------------------------------------------------
   Read
   --------------------------------------------------------------------------- */

export async function loadSaveTargets(
  entityType: SaveEntity,
  entityId: string,
): Promise<SaveTargets> {
  const parsed = z.object({ entityType: entity, entityId: uuid }).safeParse({
    entityType,
    entityId,
  });
  if (!parsed.success) return NO_TARGETS;

  const s = await session();
  if (!s) return NO_TARGETS;

  /*
    Two reads, issued together. The plan row is needed to say what the limit is,
    and plan_limit() is not executable by a client role on purpose, so the limit
    is read from plan_limits directly.

    is_saved USED TO BE A THIRD ONE AND IS NOT CALLED ANY MORE. It answers "is
    this in the plain saved list", which was a separate question while the picker
    had a separate Saved row. It is not one now: the mirror trigger keeps that
    list equal to "in at least one collection", so asking it is asking the
    collections the same question twice and paying a round trip for the echo.
  */
  const [collections, plan] = await Promise.all([
    s.db.rpc("my_collections_for", {
      p_entity_type: parsed.data.entityType,
      p_entity_id: parsed.data.entityId,
    }),
    s.db.from("profiles").select("plan").eq("id", s.user.id).maybeSingle(),
  ]);

  if (collections.error) {
    console.error(
      "[collections] load failed",
      collections.error.code,
      collections.error.message,
    );
    return NO_TARGETS;
  }

  const rows: CollectionRow[] = (
    (collections.data as Record<string, unknown>[] | null) ?? []
  ).map((r) => ({
    id: String(r.id),
    name: String(r.name ?? ""),
    description: (r.description as string | null) ?? null,
    isPublic: r.is_public === true,
    itemCount: Number(r.item_count ?? 0),
    contains: r.contains === true,
  }));

  let limit: number | null = 0;
  const planName = (plan.data as { plan: string } | null)?.plan;
  if (planName) {
    const { data: limitRow } = await s.db
      .from("plan_limits")
      .select("limit_value")
      .eq("plan", planName)
      .eq("limit_key", "collections")
      .maybeSingle();
    /* null in that column means unlimited, and so does null here. */
    limit = (limitRow as { limit_value: number | null } | null)?.limit_value ?? null;
  }

  return { collections: rows, limit, used: rows.length };
}

/* ---------------------------------------------------------------------------
   Write
   --------------------------------------------------------------------------- */

export async function toggleInCollection(
  collectionId: string,
  entityType: SaveEntity,
  entityId: string,
): Promise<SaveResult> {
  const parsed = z
    .object({ collectionId: uuid, entityType: entity, entityId: uuid })
    .safeParse({ collectionId, entityType, entityId });
  if (!parsed.success) return { status: "error", message: "That did not work." };

  const s = await session();
  if (!s) return REFUSED;

  const { data, error } = await s.db.rpc("toggle_collection_item", {
    p_collection_id: parsed.data.collectionId,
    p_entity_type: parsed.data.entityType,
    p_entity_id: parsed.data.entityId,
  });
  if (error) return explain(error);

  revalidateFor(parsed.data.entityType);
  return { status: "ok", contains: data === true };
}

/*
  Create, and put the thing straight in.

  The founder's flow ends with the new collection selected and the item in it, so
  this is one call rather than create-then-add: two calls can half succeed, and on
  a free account the half that succeeded would have spent the only collection.
*/
const createSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the collection a name.")
    .max(80, "Keep the name under 80 characters."),
  description: z
    .string()
    .trim()
    .max(500, "Keep the description under 500 characters.")
    .optional(),
  isPublic: z.boolean(),
  entityType: entity,
  entityId: uuid,
});

export async function createCollectionWith(input: {
  name: string;
  description?: string;
  isPublic: boolean;
  entityType: SaveEntity;
  entityId: string;
}): Promise<SaveResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "That did not work.",
    };
  }

  const s = await session();
  if (!s) return REFUSED;

  const { data, error } = await s.db.rpc("create_collection_with_item", {
    p_name: parsed.data.name,
    p_description: parsed.data.description ?? null,
    p_is_public: parsed.data.isPublic,
    p_entity_type: parsed.data.entityType,
    p_entity_id: parsed.data.entityId,
  });
  if (error) return explain(error);

  revalidateFor(parsed.data.entityType);
  return { status: "ok", collectionId: String(data), contains: true };
}

/* The profile renders both the saved tabs and the collections tab, so it is
   stale after any of these. The tool page shows its own saved state. */
function revalidateFor(entityType: SaveEntity) {
  revalidatePath("/profile");
  if (entityType === "post") revalidatePath("/community");
}

/* ---------------------------------------------------------------------------
   Save a comparison

   A comparison is an ordered list of tools and models, which is what a
   collection already is, so saving one creates a collection holding them in
   column order (D113). No comparisons table, no second saved system. The plan
   cap, the name uniqueness and the ownership policies all apply unchanged,
   because the RPC runs as the caller.
   --------------------------------------------------------------------------- */

const comparisonSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give it a name.")
    .max(80, "Keep the name under 80 characters."),
  isPublic: z.boolean(),
  items: z
    .array(z.object({ type: z.enum(["tool", "model"]), id: uuid }))
    .min(2, "A comparison needs at least two items.")
    .max(12),
});

export async function saveComparison(input: {
  name: string;
  isPublic: boolean;
  items: { type: "tool" | "model"; id: string }[];
}): Promise<SaveResult> {
  const parsed = comparisonSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "That did not work.",
    };
  }

  const s = await session();
  if (!s) return { status: "error", message: "Sign in to save a comparison." };

  const { data, error } = await s.db.rpc("create_collection_from_items", {
    p_name: parsed.data.name,
    p_description: null,
    p_is_public: parsed.data.isPublic,
    p_items: parsed.data.items,
  });
  if (error) {
    if (error.message.includes("compare_item_unavailable")) {
      return {
        status: "error",
        message: "One of these is no longer listed. Remove it and try again.",
      };
    }
    return explain(error);
  }

  revalidatePath("/profile");
  return { status: "ok", collectionId: String(data) };
}
