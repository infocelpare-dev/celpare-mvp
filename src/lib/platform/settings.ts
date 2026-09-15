import { cache } from "react";
import { createAnonClient, isSupabaseConfigured } from "@/lib/supabase/server";

/*
  The public half of public.platform_settings.

  Phase 4P built the settings surface and nothing read it, so every flag was
  inert: an administrator could turn public signup off and accounts kept being
  created. This is the read side that makes them mean something.

  Anonymous client on purpose. These are consulted before a session exists, on
  the signup page and on the marketing pages, and public_platform_settings()
  returns only the rows marked is_public, so there is nothing here a visitor
  should not see. The private keys, the moderation thresholds, are unreachable
  through it.

  Cached per request with React's cache, so a page that reads three flags makes
  one round trip rather than three.
*/

export type FlagKey =
  | "features.public_signup"
  | "features.tool_submission"
  | "features.model_submission"
  | "features.community_composer"
  | "features.ask_celpare";

type Settings = Record<string, unknown>;

const FALLBACK: Settings = {};

export const getPublicSettings = cache(async (): Promise<Settings> => {
  if (!isSupabaseConfigured()) return FALLBACK;

  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("public_platform_settings");
    if (error) {
      console.warn("[settings] public_platform_settings failed:", error.message);
      return FALLBACK;
    }
    return (data as Settings) ?? FALLBACK;
  } catch (e) {
    console.warn("[settings] unreachable:", e);
    return FALLBACK;
  }
});

/*
  Fails OPEN, deliberately, and this is the one decision in here worth arguing
  about.

  A flag that cannot be read means the database is unreachable, and at that
  point nothing works anyway. The alternative, failing closed, turns a blip in
  the settings read into a platform that silently refuses signups and
  submissions while every other page looks healthy. That is the worse outcome
  and the harder one to diagnose.

  These flags are operational switches, not authorization. Nothing here decides
  who may do something: RLS does that, and RLS does fail closed. A flag decides
  only whether a door is currently open to everybody.
*/
export async function isEnabled(flag: FlagKey): Promise<boolean> {
  const settings = await getPublicSettings();
  const value = settings[flag];
  return value === undefined ? true : value === true;
}

export type Announcement = { active: boolean; message: string };

export async function getAnnouncement(): Promise<Announcement | null> {
  const settings = await getPublicSettings();
  const active = settings["announcement.active"] === true;
  const message = settings["announcement.message"];

  if (!active || typeof message !== "string" || message.trim() === "") return null;
  return { active, message: message.trim() };
}

/* Slugs, in the order an administrator put them in. The caller resolves them
   against the catalogue, so a slug that no longer exists simply drops out
   rather than rendering an empty card. */
export async function getFeatured(kind: "tools" | "models"): Promise<string[]> {
  const settings = await getPublicSettings();
  const value = settings[`content.featured_${kind}`];
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}
