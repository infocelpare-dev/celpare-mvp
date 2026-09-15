"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { isEnabled } from "@/lib/platform/settings";
import { DEVELOPER_TERMS_VERSION } from "@/lib/developer/queries";

export type DeveloperState = {
  status: "idle" | "success" | "error";
  message: string;
  field?: string;
};

/*
  Every write in the developer area.

  The doctrine from settings.ts and profile.ts holds here and matters more,
  because this surface touches the public catalogue:

    1. Hardcoded column literals. formData is never spread into an update.
    2. A zod allowlist on the way in.
    3. The database is the control. `status`, `verified`, `developer_id`,
       `source` and `submitted_at` are absent from every client grant AND
       overwritten by tg_submission_guard, so even a perfect forgery of this
       file could not approve a tool.

  Nothing in here reads profiles.is_developer to decide whether an action is
  allowed. The RLS policies gate on developer_profiles.accepted_terms_at, and
  a failed policy is the answer.
*/

const httpsish = (v: string) => v === "" || /^https?:\/\/[^\s]+$/.test(v);

function list(raw: string, max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const item = part.trim().replace(/\s+/g, " ");
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

const blank = (v: string | undefined) => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

/*
  saveDeveloperProfile was removed on 2026-09-14. There is no separate
  developer identity to edit: the Celpare account IS the developer account.
  The developer_profiles row is created once, by becomeDeveloper, purely as the
  record that the terms were accepted.
*/

/* -------------------------------------------------------------------- terms */

export async function acceptTerms(
  _prev: DeveloperState,
  formData: FormData,
): Promise<DeveloperState> {
  if (!isSupabaseConfigured()) return { status: "error", message: "Not connected." };

  // The checkbox is the record that it was a deliberate act, not a default.
  if (formData.get("agree") !== "on") {
    return { status: "error", message: "Tick the box to agree before continuing." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Sign in first." };

  /*
    An RPC, not a column write. The timestamp is set to now() inside the
    function, so it cannot be supplied, forged or backdated by the caller, and
    accepted_terms_at appears in no client grant at all.
  */
  const { error } = await supabase.rpc("accept_developer_terms", {
    p_version: DEVELOPER_TERMS_VERSION,
  });

  if (error) {
    console.error("[developer] accept terms failed", error.code, error.message);
    if (error.code === "P0002") {
      return { status: "error", message: "Create your developer profile first." };
    }
    return { status: "error", message: "Could not record that. Please try again." };
  }

  revalidatePath("/developer");
  redirect("/developer");
}

/* --------------------------------------------------------------- submissions */

const toolSchema = z.object({
  slug: z.string().trim().toLowerCase()
    .regex(/^[a-z0-9-]{2,60}$/, "Use 2 to 60 characters: lowercase letters, numbers or hyphens."),
  name: z.string().trim().min(1, "Give the tool a name.").max(120),
  tagline: z.string().trim().max(200).optional(),
  description: z.string().trim().min(1, "Describe what it does.").max(4000),
  websiteUrl: z.string().trim().max(2048).refine(httpsish, "Must start with http:// or https://").optional(),
  docsUrl: z.string().trim().max(2048).refine(httpsish, "Must start with http:// or https://").optional(),
  logoUrl: z.string().trim().max(2048).refine(httpsish, "Must start with http:// or https://").optional(),
  pricing: z.string().trim().max(300).optional(),
  pricingModel: z.enum(["free", "freemium", "paid", "enterprise"]).optional(),
  tags: z.string().max(600).optional(),
  features: z.string().max(1200).optional(),
  platforms: z.string().max(600).optional(),
});

export async function submitTool(
  _prev: DeveloperState,
  formData: FormData,
): Promise<DeveloperState> {
  if (!isSupabaseConfigured()) return { status: "error", message: "Not connected." };

  /* Operational switch, not authorization: RLS still decides who may submit.
     This decides whether the door is open to anybody at all. */
  if (!(await isEnabled("features.tool_submission"))) {
    return { status: "error", message: "Tool submissions are paused right now. Nothing you submitted was lost." };
  }

  const raw = {
    slug: formData.get("slug") ?? "",
    name: formData.get("name") ?? "",
    tagline: formData.get("tagline") ?? "",
    description: formData.get("description") ?? "",
    websiteUrl: formData.get("websiteUrl") ?? "",
    docsUrl: formData.get("docsUrl") ?? "",
    logoUrl: formData.get("logoUrl") ?? "",
    pricing: formData.get("pricing") ?? "",
    pricingModel: (formData.get("pricingModel") || undefined) as string | undefined,
    tags: formData.get("tags") ?? "",
    features: formData.get("features") ?? "",
    platforms: formData.get("platforms") ?? "",
  };

  const parsed = toolSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      status: "error",
      message: issue?.message ?? "Please check the form.",
      field: issue?.path[0] as string,
    };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Sign in first." };

  const d = parsed.data;

  /*
    Note what is NOT in this object: status, verified, developer_id, source,
    submitted_at, published_at, rating, popularity_score. None of them is in
    the client grant, and tg_submission_guard overwrites all of them anyway.
    A submission is always a draft owned by the caller.
  */
  const { error } = await supabase.from("tools").insert({
    slug: d.slug,
    name: d.name,
    tagline: blank(d.tagline),
    description: d.description,
    website_url: blank(d.websiteUrl),
    docs_url: blank(d.docsUrl),
    logo_url: blank(d.logoUrl),
    pricing: blank(d.pricing),
    pricing_model: d.pricingModel ?? null,
    tags: list(d.tags ?? "", 12),
    features: list(d.features ?? "", 20),
    platforms: list(d.platforms ?? "", 10),
  });

  if (error) {
    console.error("[developer] tool submit failed", error.code, error.message);
    if (error.code === "23505") {
      return { status: "error", message: "That slug is already taken.", field: "slug" };
    }
    if (error.code === "42501") {
      return {
        status: "error",
        message: "Your developer profile is not active yet. Accept the developer terms first.",
      };
    }
    if (error.message.includes("plan_limit_reached")) {
      return { status: "error", message: "You have reached the submission limit." };
    }
    return { status: "error", message: "Could not save that. Please try again." };
  }

  revalidatePath("/developer/tools");
  revalidatePath("/developer");
  redirect("/developer/tools");
}

const modelSchema = z.object({
  slug: z.string().trim().toLowerCase()
    .regex(/^[a-z0-9-.]{2,60}$/, "Use 2 to 60 characters: lowercase letters, numbers, hyphens or dots."),
  name: z.string().trim().min(1, "Give the model a name.").max(120),
  provider: z.string().trim().min(1, "Name the provider.").max(120),
  description: z.string().trim().max(4000).optional(),
  websiteUrl: z.string().trim().max(2048).refine(httpsish, "Must start with http:// or https://").optional(),
  contextWindow: z.coerce.number().int().min(0).max(100_000_000).optional(),
  tags: z.string().max(600).optional(),
  modalities: z.string().max(300).optional(),
});

export async function submitModel(
  _prev: DeveloperState,
  formData: FormData,
): Promise<DeveloperState> {
  if (!isSupabaseConfigured()) return { status: "error", message: "Not connected." };

  /* Operational switch, not authorization: RLS still decides who may submit.
     This decides whether the door is open to anybody at all. */
  if (!(await isEnabled("features.model_submission"))) {
    return { status: "error", message: "Model submissions are paused right now. Nothing you submitted was lost." };
  }

  const ctx = String(formData.get("contextWindow") ?? "").trim();
  const parsed = modelSchema.safeParse({
    slug: formData.get("slug") ?? "",
    name: formData.get("name") ?? "",
    provider: formData.get("provider") ?? "",
    description: formData.get("description") ?? "",
    websiteUrl: formData.get("websiteUrl") ?? "",
    contextWindow: ctx === "" ? undefined : ctx,
    tags: formData.get("tags") ?? "",
    modalities: formData.get("modalities") ?? "",
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      status: "error",
      message: issue?.message ?? "Please check the form.",
      field: issue?.path[0] as string,
    };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Sign in first." };

  const d = parsed.data;

  const { error } = await supabase.from("models").insert({
    slug: d.slug,
    name: d.name,
    provider: d.provider,
    description: blank(d.description),
    website_url: blank(d.websiteUrl),
    context_window: d.contextWindow ?? null,
    tags: list(d.tags ?? "", 12),
    modalities: list(d.modalities ?? "", 8),
  });

  if (error) {
    console.error("[developer] model submit failed", error.code, error.message);
    if (error.code === "23505") {
      return { status: "error", message: "That slug is already taken.", field: "slug" };
    }
    if (error.code === "42501") {
      return {
        status: "error",
        message: "Your developer profile is not active yet. Accept the developer terms first.",
      };
    }
    return { status: "error", message: "Could not save that. Please try again." };
  }

  revalidatePath("/developer/models");
  revalidatePath("/developer");
  redirect("/developer/models");
}

/* ------------------------------------------------------------ send to review */

export async function sendForReview(
  _prev: DeveloperState,
  formData: FormData,
): Promise<DeveloperState> {
  if (!isSupabaseConfigured()) return { status: "error", message: "Not connected." };

  const kind = formData.get("kind");
  const id = formData.get("id");
  if ((kind !== "tool" && kind !== "model") || typeof id !== "string") {
    return { status: "error", message: "That did not work." };
  }

  const supabase = await createClient();

  /*
    An RPC because this is a STATE CHANGE, and status is not a column any
    client may write. The function re-checks ownership and the current state
    server side, so this action cannot move somebody else's submission or
    jump a rejected one back into the queue.
  */
  const { error } = await supabase.rpc("submit_for_review", {
    p_kind: kind,
    p_id: id,
  });

  if (error) {
    console.error("[developer] send for review failed", error.code, error.message);
    if (error.code === "42501") {
      return { status: "error", message: "That is not yours to submit." };
    }
    return { status: "error", message: "Could not submit that for review." };
  }

  revalidatePath("/developer/tools");
  revalidatePath("/developer/models");
  revalidatePath("/developer");
  return { status: "success", message: "Sent for review." };
}

/* ------------------------------------------------- becoming a developer */

/*
  One step, deliberately.

  Agreeing to the terms creates the developer profile, records the agreement
  and turns the interface on together. The earlier version made a person create
  a profile first and then come back to agree, which is two forms to reach one
  decision they have already made. The handle is generated from their username
  and is editable straight afterwards.

  Ordering matters: the profile has to exist before accept_developer_terms can
  stamp it, and is_developer is set last so a half finished state never leaves
  somebody looking at a workspace they cannot use.
*/
export async function becomeDeveloper(
  _prev: DeveloperState,
  formData: FormData,
): Promise<DeveloperState> {
  if (!isSupabaseConfigured()) return { status: "error", message: "Not connected." };

  if (formData.get("agree") !== "on") {
    return { status: "error", message: "Read the terms, then agree to continue." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Sign in first." };

  const { data: account } = await supabase
    .from("profiles").select("username, full_name").eq("id", user.id).maybeSingle();

  const { data: existing } = await supabase
    .from("developer_profiles").select("id").eq("id", user.id).maybeSingle();

  if (!existing) {
    const base = (account?.username ?? "dev").toString().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    let handle = base.length >= 3 ? base.slice(0, 26) : `dev-${base}`.slice(0, 26);

    // The handle namespace is separate from usernames, so a collision here is
    // ordinary rather than exceptional. Try a few suffixes before giving up.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = attempt === 0 ? handle : `${handle}-${attempt}`;
      const { error } = await supabase.from("developer_profiles").insert({
        id: user.id,
        handle: candidate,
        display_name: account?.full_name ?? null,
      });
      if (!error) { handle = candidate; break; }
      if (error.code !== "23505") {
        console.error("[developer] create profile failed", error.code, error.message);
        return { status: "error", message: "Could not set that up. Please try again." };
      }
      if (attempt === 4) {
        return { status: "error", message: "Could not pick a developer handle. Try again." };
      }
    }
  }

  const { error: termsError } = await supabase.rpc("accept_developer_terms", {
    p_version: DEVELOPER_TERMS_VERSION,
  });
  if (termsError) {
    console.error("[developer] accept terms failed", termsError.code, termsError.message);
    return { status: "error", message: "Could not record your agreement. Please try again." };
  }

  const { error: flagError } = await supabase
    .from("profiles").update({ is_developer: true }).eq("id", user.id);
  if (flagError) {
    console.error("[developer] enable mode failed", flagError.code, flagError.message);
    return { status: "error", message: "Could not open the workspace. Please try again." };
  }

  revalidatePath("/profile");
  revalidatePath("/settings");
  revalidatePath("/developer");
  redirect("/developer");
}

/*
  Declined. Nothing is created and nothing is recorded, which is the point: a
  person who says no should leave no trace of having been asked.
*/
export async function declineDeveloper(): Promise<void> {
  redirect("/profile");
}
