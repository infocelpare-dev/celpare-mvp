"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  cleanRef,
  GOAL_KEYS,
  HEARD_KEYS,
  LIMITS,
  REF_COOKIE,
  ROLE_KEYS,
  STEPS,
} from "@/lib/onboarding/options";
import { suggestPeople, type Suggestion } from "@/lib/onboarding/server";

export type OnboardingResult = { ok: boolean; message: string };

/*
  Onboarding answers (phase ONB, D224). The settings.ts doctrine: zod
  allowlist in, named columns out, getUser not getSession, and the database as
  the control (own row RLS, column grants, CHECKs on every list).

  Each step saves as it is answered, so leaving halfway keeps what was given.
  A step's payload replaces that step's columns only; the others are untouched.
*/
const uuidList = (max: number) => z.array(z.string().uuid()).max(max);

const schema = z.object({
  role: z.enum(ROLE_KEYS).nullable().optional(),
  goals: z.array(z.enum(GOAL_KEYS)).max(GOAL_KEYS.length).optional(),
  categoryIds: uuidList(LIMITS.CATEGORIES).optional(),
  topicIds: uuidList(LIMITS.TOPICS).optional(),
  toolIds: uuidList(LIMITS.TOOLS).optional(),
  heardFrom: z.enum(HEARD_KEYS).nullable().optional(),
  heardOther: z.string().trim().max(LIMITS.HEARD_OTHER).optional(),
  skipped: z.enum(STEPS).optional(),
});

export type OnboardingInput = z.input<typeof schema>;

type Session = { db: Awaited<ReturnType<typeof createClient>>; userId: string };

async function session(): Promise<Session | null> {
  if (!isSupabaseConfigured()) return null;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  return user ? { db, userId: user.id } : null;
}

/* The row, made on first write with the campaign tag from the landing link.
   `ref` is not in the update grant, so first touch is the only touch. */
async function ensureRow(s: Session) {
  const ref = cleanRef((await cookies()).get(REF_COOKIE)?.value);
  const { error } = await s.db.from("user_onboarding")
    .upsert({ user_id: s.userId, ...(ref ? { ref } : {}) }, { onConflict: "user_id", ignoreDuplicates: true });
  if (error) console.error("[onboarding] row failed", error.code, error.message);
}

/* Ids that exist. A made up uuid is dropped here rather than stored. */
async function existing(s: Session, table: "categories" | "topics" | "tools", ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  let q = s.db.from(table).select("id").in("id", ids);
  if (table === "tools") q = q.eq("status", "approved");
  const { data } = await q;
  const ok = new Set(((data ?? []) as { id: string }[]).map((r) => r.id));
  return [...new Set(ids)].filter((id) => ok.has(id));
}

export async function saveOnboarding(input: OnboardingInput): Promise<OnboardingResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "That answer was not valid." };
  const s = await session();
  if (!s) return { ok: false, message: "Sign in to continue." };
  const d = parsed.data;

  await ensureRow(s);

  const patch: Record<string, unknown> = {};
  if (d.role !== undefined) patch.role = d.role;
  if (d.goals !== undefined) patch.goals = [...new Set(d.goals)];
  if (d.categoryIds !== undefined) patch.category_ids = await existing(s, "categories", d.categoryIds);
  if (d.topicIds !== undefined) patch.topic_ids = await existing(s, "topics", d.topicIds);
  if (d.toolIds !== undefined) patch.tool_ids = await existing(s, "tools", d.toolIds);
  if (d.heardFrom !== undefined) {
    patch.heard_from = d.heardFrom;
    patch.heard_from_other = d.heardFrom === "other" && d.heardOther ? d.heardOther : null;
  }

  if (d.skipped) {
    const { data } = await s.db.from("user_onboarding").select("skipped").eq("user_id", s.userId).maybeSingle();
    const prev = ((data as { skipped: string[] } | null)?.skipped ?? []);
    patch.skipped = [...new Set([...prev, d.skipped])];
  }

  if (Object.keys(patch).length === 0) return { ok: true, message: "" };

  const { error } = await s.db.from("user_onboarding").update(patch).eq("user_id", s.userId);
  if (error) {
    console.error("[onboarding] save failed", error.code, error.message);
    return { ok: false, message: "That did not save. Try again." };
  }
  return { ok: true, message: "Saved." };
}

/* People for the last step, from the topics picked a moment ago. */
export async function suggestFollows(topicIds: string[]): Promise<Suggestion[]> {
  const parsed = uuidList(LIMITS.TOPICS).safeParse(topicIds);
  if (!parsed.success) return [];
  const s = await session();
  if (!s) return [];
  return suggestPeople(s.db, s.userId, parsed.data);
}

/*
  Done, at the end of the last step. Shown once (founder 2026-10-31), so this
  sets onboarded_at, which is in the owner's update grant on profiles. There
  is no Skip all (founder 2026-10-31); each step has its own Skip.
*/
export async function finishOnboarding(): Promise<OnboardingResult> {
  const s = await session();
  if (!s) return { ok: false, message: "Sign in to continue." };

  await ensureRow(s);
  const now = new Date().toISOString();

  const patch: Record<string, unknown> = { completed_at: now };

  const [a, b] = await Promise.all([
    s.db.from("user_onboarding").update(patch).eq("user_id", s.userId),
    s.db.from("profiles").update({ onboarded_at: now }).eq("id", s.userId),
  ]);
  const error = a.error ?? b.error;
  if (error) {
    console.error("[onboarding] finish failed", error.code, error.message);
    return { ok: false, message: "That did not save. Try again." };
  }
  revalidatePath("/community");
  return { ok: true, message: "" };
}
