"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { isEnabled } from "@/lib/platform/settings";
import {
  SNIFF_BYTES,
  isOwnUpload,
  parseStorageUrl,
  sniffImage,
  sniffVideo,
  VIDEO_BUCKET,
} from "@/lib/tools/media";
import { DEVELOPER_TERMS_VERSION } from "@/lib/developer/queries";

export type DeveloperState = {
  status: "idle" | "success" | "error";
  message: string;
  field?: string;
  /*
    What was typed, echoed back when a submission is refused.

    React 19 resets a form once its action has run, which on a twelve field
    submission form means one taken slug costs somebody everything they wrote.
    The form re-renders these as defaults, so a rejection costs a correction
    rather than a retype. Only the actions that own a long form set it.
  */
  /* Repeatable fields (categories, screenshots, videos, other links) come
     back as arrays, so one refusal restores the rows a person added as well
     as the text they typed. */
  values?: Record<string, string | string[]>;
  /*
    Failed attempts so far. The form keys its remount on this, because a new
    default value is only picked up by an input that mounts again.
  */
  attempt?: number;
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

/*
  A tool submission is a whole public profile now, not a row in one table.

  Founder brief, 2026-09-17: one multi step form collecting everything
  /tools/[slug] renders, so a developer fills it in once and the profile is
  complete. The fields below are that brief's list and nothing else.

  What it deliberately does NOT collect: likes, dislikes, saves, shares, star
  ratings and reviews. Those are what the public does to a tool. A form letting
  an owner type them in would be inventing engagement, which D13 and D30 have
  already settled twice.

  Where each field lands:
    tools            name, slug, tagline, description, website, docs, logo,
                     pricing, pricing_model, tags, owner_email
    tool_categories  category
    tool_links       demo, github, and the other links
    tool_media       cover, screenshots, videos

  All four tables are written by one transaction, public.create_tool_draft.
  Read that function before changing anything here: there is no DELETE grant on
  tools, so four separate writes could strand a half built draft forever.
*/

const TOOL_TEXT_FIELDS = [
  "slug", "name", "tagline", "description", "websiteUrl", "docsUrl", "logoUrl",
  "demoUrl", "githubUrl", "pricing", "pricingModel", "tags",
  "ownerEmail",
] as const;

/* Repeatable inputs. Each renders as several controls sharing one name, so the
   action reads them with getAll and the form can add and remove rows without
   indexed names that have to be kept in order. */
const TOOL_LIST_FIELDS = [
  "categories", "screenshotUrl", "videoUrl", "otherLinkKind", "otherLinkUrl",
] as const;

/*
  tool_media requires https. tool_links accepts http or https. That is not an
  inconsistency to tidy away: media is rendered as an <img> or an iframe on a
  public page, so a plain http URL makes every visitor's browser report the
  whole profile as insecure. A link is something a person chooses to click.
*/
const httpsOnly = (v: string) => v === "" || /^https:\/\/[^\s]+$/.test(v);

/* The kinds tool_links_kind_ok allows, minus the two that have fields of their
   own. Offering demo or github here as well would let somebody fill both and
   hit the (tool_id, kind) primary key with no idea why. */
const OTHER_LINK_KINDS = [
  "discord", "x", "linkedin", "api", "changelog", "pricing", "other",
] as const;

const MAX_CATEGORIES = 4;
const MAX_SCREENSHOTS = 8;
const MAX_VIDEOS = 4;
const MAX_OTHER_LINKS = 6;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const toolSchema = z.object({
  slug: z.string().trim().toLowerCase()
    .regex(/^[a-z0-9-]{2,60}$/, "Use 2 to 60 characters: lowercase letters, numbers or hyphens."),
  name: z.string().trim().min(1, "Give the tool a name.").max(120),
  tagline: z.string().trim().max(200, "Keep the tagline under 200 characters.").optional(),
  description: z.string().trim().min(1, "Say what the tool does.").max(4000),
  /* Required. The owner email is checked against this domain, so without it
     there is nothing to check against. */
  websiteUrl: z.string().trim().max(2048)
    .regex(/^https?:\/\/[^\s]+$/, "Give the tool's website, starting with https://"),
  docsUrl: z.string().trim().max(2048).refine(httpsish, "Must start with http:// or https://").optional(),
  demoUrl: z.string().trim().max(2048).refine(httpsish, "Must start with http:// or https://").optional(),
  githubUrl: z.string().trim().max(2048).refine(httpsish, "Must start with http:// or https://").optional(),
  logoUrl: z.string().trim().max(2048).refine(httpsOnly, "The logo URL must start with https://").optional(),
  pricing: z.string().trim().max(300, "Keep the pricing note under 300 characters.").optional(),
  pricingModel: z.enum(["free", "freemium", "paid", "enterprise"]).optional(),
  tags: z.string().max(600).optional(),
  /*
    Required, and it is not in the founder's field list. It stays because 4T
    made it load bearing: submit_for_review raises owner_email_required without
    it, so a form that dropped it would build tools that can never be reviewed
    and therefore can never go live. It is never shown publicly and no client
    role holds SELECT on the column.
  */
  ownerEmail: z.string().trim().toLowerCase().max(254)
    .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "Enter a work email address on the tool's own domain."),
});

/*
  The same normalization the database uses, so the form can refuse a mismatch
  before a round trip and say the same thing the trigger would have said.

  This is a COURTESY, not the control. public.tg_tool_domain rejects the row
  whatever this function thinks, which is the only reason it is safe for this
  copy to drift.
*/
function canonicalDomain(url: string): string | null {
  const d = url.trim().toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/:[0-9]+$/, "")
    .replace(/^www\./, "");
  return d === "" ? null : d;
}

function emailDomain(email: string): string | null {
  const d = email.trim().toLowerCase().split("@")[1];
  return d ? d : null;
}

/* Mirrors public.is_free_email_domain. A personal mailbox proves you have a
   personal mailbox, which is not the question being asked. */
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "yahoo.co.in",
  "hotmail.com", "hotmail.co.uk", "outlook.com", "live.com", "msn.com",
  "aol.com", "icloud.com", "me.com", "mac.com", "proton.me", "protonmail.com",
  "pm.me", "gmx.com", "gmx.net", "gmx.de", "mail.com", "mail.ru", "yandex.com",
  "yandex.ru", "zoho.com", "tutanota.com", "tuta.io", "fastmail.com", "hey.com",
  "qq.com", "163.com", "126.com", "sina.com", "naver.com", "daum.net",
  "web.de", "t-online.de", "free.fr", "orange.fr", "libero.it", "rediffmail.com",
]);

/*
  THE CONTROL on uploaded media, as opposed to the courtesy in the browser.

  Two questions, and the second is the one that matters.

  1. Is this URL an upload of the CALLER'S OWN? The storage policy stops one
     account writing into another's folder. It says nothing about an account
     naming a file it did not upload, because the hidden field the uploader
     fills in is just a form field and a crafted POST can put anything in it.
     So a URL outside our buckets, or inside somebody else's folder, is refused
     here rather than stored as if it were theirs.

  2. Is the file what it claims to be? Re-read from the bucket, not from what
     the browser said. The bucket's MIME allowlist trusts the Content-Type the
     uploader declared, and a client declares whatever it likes, so the only
     honest answer is the bytes. Read with a Range request: sixteen bytes off a
     50 MB video rather than the video.

  A file that fails is left in the bucket rather than deleted. It is already
  unreachable from any tool, and deleting on a refusal would let a crafted
  request use this path to delete files by guessing at them.
*/
async function verifyUploads(
  urls: { url: string; field: string }[],
  userId: string,
): Promise<{ url: string; field: string } | null> {
  for (const item of urls) {
    if (!isOwnUpload(item.url, userId)) return item;

    const parsed = parseStorageUrl(item.url);
    if (!parsed) return item;

    try {
      const res = await fetch(item.url, {
        headers: { Range: `bytes=0-${SNIFF_BYTES - 1}` },
        cache: "no-store",
      });
      if (!res.ok) return item;

      const head = new Uint8Array(await res.arrayBuffer());
      const ok =
        parsed.bucket === VIDEO_BUCKET ? sniffVideo(head) : sniffImage(head);
      if (!ok) return item;
    } catch (e) {
      console.error("[developer] media verify failed", String(e));
      return item;
    }
  }
  return null;
}

export async function submitTool(
  _prev: DeveloperState,
  formData: FormData,
): Promise<DeveloperState> {
  /*
    Read everything first, so every refusal below can hand it back. This form
    is three steps long, and somebody may be on the review step when the slug
    turns out to be taken. Being dropped back onto an empty step one would be
    the worst possible moment to lose the lot.
  */
  const raw: Record<string, string | string[]> = {};
  for (const key of TOOL_TEXT_FIELDS) {
    const v = formData.get(key);
    raw[key] = typeof v === "string" ? v : "";
  }
  for (const key of TOOL_LIST_FIELDS) {
    raw[key] = formData.getAll(key).filter((v): v is string => typeof v === "string");
  }

  const str = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : "");
  const arr = (k: string) => (Array.isArray(raw[k]) ? (raw[k] as string[]) : []);

  /* "Submit Tool" sends for review inside the same transaction. Anything else
     is "Save Draft": a button whose name we do not recognise must never be the
     one that moves a submission forward. */
  const send = formData.get("intent") === "submit";

  const fail = (message: string, field?: string): DeveloperState => ({
    status: "error",
    message,
    field,
    values: raw,
    attempt: (_prev.attempt ?? 0) + 1,
  });

  if (!isSupabaseConfigured()) return fail("Not connected.");

  /* Operational switch, not authorization: RLS still decides who may submit.
     This decides whether the door is open to anybody at all. */
  if (!(await isEnabled("features.tool_submission"))) {
    return fail("Tool submissions are paused right now. Nothing you submitted was lost.");
  }

  const parsed = toolSchema.safeParse({
    slug: str("slug"),
    name: str("name"),
    tagline: str("tagline"),
    description: str("description"),
    websiteUrl: str("websiteUrl"),
    docsUrl: str("docsUrl"),
    demoUrl: str("demoUrl"),
    githubUrl: str("githubUrl"),
    logoUrl: str("logoUrl"),
    pricing: str("pricing"),
    /* An empty select is "not saying yet", which the schema spells as absent
       rather than as an empty string. */
    pricingModel: str("pricingModel") === "" ? undefined : str("pricingModel"),
    tags: str("tags"),
    ownerEmail: str("ownerEmail"),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(issue?.message ?? "Please check the form.", issue?.path[0] as string);
  }

  const d = parsed.data;

  /*
    Ownership, checked here for the message and enforced in the database for
    real. A subdomain of the tool's domain passes, so mail.example.com may
    speak for example.com. A domain that merely ENDS with it does not, which is
    why the test is on a leading dot: notexample.com is a different company.
  */
  const site = canonicalDomain(d.websiteUrl);
  const mail = emailDomain(d.ownerEmail);

  if (!site) {
    return fail("Give the tool's website so the email can be checked against it.", "websiteUrl");
  }
  if (!mail) {
    return fail("Enter a work email address on the tool's own domain.", "ownerEmail");
  }
  if (FREE_EMAIL_DOMAINS.has(mail)) {
    return fail(
      `A personal address does not show you speak for ${site}. Use one on that domain, for example support@${site}.`,
      "ownerEmail",
    );
  }
  if (mail !== site && !mail.endsWith(`.${site}`)) {
    return fail(
      `That email is on ${mail}, and the tool's website is ${site}. The address has to be on the tool's own domain, for example support@${site}.`,
      "ownerEmail",
    );
  }

  /* ------------------------------------------------------------- categories */

  const categories = arr("categories")
    .filter((v) => UUID_RE.test(v))
    .slice(0, MAX_CATEGORIES);
  if (categories.length === 0) {
    return fail("Choose at least one category, so people can find it.", "categories");
  }

  /* ------------------------------------------------------------------ links */

  const links: { kind: string; url: string }[] = [];
  if (d.demoUrl) links.push({ kind: "demo", url: d.demoUrl });
  if (d.githubUrl) links.push({ kind: "github", url: d.githubUrl });

  const otherKinds = arr("otherLinkKind");
  const otherUrls = arr("otherLinkUrl");
  for (let i = 0; i < otherUrls.length && i < MAX_OTHER_LINKS; i += 1) {
    const url = (otherUrls[i] ?? "").trim();
    const kind = (otherKinds[i] ?? "").trim();
    if (url === "") continue;
    if (!httpsish(url)) {
      return fail("Every other link must start with http:// or https://", "otherLinkUrl");
    }
    if (!(OTHER_LINK_KINDS as readonly string[]).includes(kind)) {
      return fail("Say what each of your other links is.", "otherLinkKind");
    }
    links.push({ kind, url });
  }

  /*
    tool_links is keyed on (tool_id, kind), so one link per kind is the shape
    the table enforces. Catching it here turns a 23505 nobody can interpret
    into a sentence that names the duplicate.
  */
  const seenKinds = new Set<string>();
  for (const l of links) {
    if (seenKinds.has(l.kind)) {
      return fail(`You have two ${l.kind} links. A tool can have one of each.`, "otherLinkKind");
    }
    seenKinds.add(l.kind);
  }

  /* ------------------------------------------------------------------ media */

  /* No cover. The kind still exists in the database, and tools submitted
     before 2026-09-18 still have their row, but nothing collects one any more
     and the profile stopped rendering it. See tools/[slug]/page.tsx. */
  const media: { kind: string; url: string; sort_order: number }[] = [];

  const shots = arr("screenshotUrl").map((v) => v.trim()).filter(Boolean).slice(0, MAX_SCREENSHOTS);
  for (const [i, url] of shots.entries()) {
    if (!httpsOnly(url)) {
      return fail("Every screenshot URL must start with https://", "screenshotUrl");
    }
    media.push({ kind: "screenshot", url, sort_order: i });
  }

  const videos = arr("videoUrl").map((v) => v.trim()).filter(Boolean).slice(0, MAX_VIDEOS);
  for (const [i, url] of videos.entries()) {
    if (!httpsOnly(url)) {
      return fail("Every video URL must start with https://", "videoUrl");
    }
    media.push({ kind: "video", url, sort_order: i });
  }

  /* ------------------------------------------------------------------ write */

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("Sign in first.");

  /*
    Every picture and video on a tool profile is an upload now, so each URL has
    to be the caller's own file and has to actually be the kind of file it
    claims. See verifyUploads: the browser's check is a courtesy, this is the
    control.
  */
  const bad = await verifyUploads(
    [
      ...(d.logoUrl ? [{ url: d.logoUrl, field: "logoUrl" }] : []),
      ...shots.map((url) => ({ url, field: "screenshotUrl" })),
      ...videos.map((url) => ({ url, field: "videoUrl" })),
    ],
    user.id,
  );
  if (bad) {
    return fail(
      "One of your uploads could not be checked. Remove it and upload it again.",
      bad.field,
    );
  }

  /*
    Note what is NOT passed: status, verified, developer_id, source,
    submitted_at, published_at, rating, popularity_score. None of them is in
    the client grant and tg_submission_guard overwrites them all regardless. A
    submission is always a draft owned by the caller, and create_tool_draft is
    SECURITY INVOKER precisely so that it grants no way around that.
  */
  const { error } = await supabase.rpc("create_tool_draft", {
    p_slug: d.slug,
    p_name: d.name,
    p_tagline: blank(d.tagline),
    p_description: d.description,
    p_website_url: blank(d.websiteUrl),
    p_docs_url: blank(d.docsUrl),
    p_logo_url: blank(d.logoUrl),
    p_pricing: blank(d.pricing),
    p_pricing_model: d.pricingModel ?? null,
    p_tags: list(d.tags ?? "", 12),
    p_owner_email: d.ownerEmail,
    p_categories: categories,
    p_links: links,
    p_media: media,
    p_send_for_review: send,
  });

  if (error) {
    console.error("[developer] tool submit failed", error.code, error.message);
    if (error.code === "23505") {
      if (error.message.includes("tool_links_pkey")) {
        return fail("Two of your links are the same kind. A tool can have one of each.", "otherLinkKind");
      }
      return fail("That slug is already taken. Pick another one.", "slug");
    }
    if (error.code === "42501") {
      if (error.message.includes("account_not_active")) {
        return fail("Your account cannot publish right now.");
      }
      return fail("Your developer profile is not active yet. Accept the developer terms first.");
    }
    if (error.message.includes("plan_limit_reached")) {
      return fail("You have reached the submission limit.");
    }
    if (error.message.includes("owner_email_required")) {
      return fail("Celpare cannot review a tool with no owner email.", "ownerEmail");
    }
    /* The database says no to the same things this action already checked.
       Reaching one of these means the two definitions have drifted, so it is
       worth a distinct message rather than a shrug. */
    if (error.message.includes("owner_email_domain_mismatch")) {
      return fail("That email is not on the tool's own domain.", "ownerEmail");
    }
    if (error.message.includes("owner_email_free_provider")) {
      return fail("Use a work address on the tool's domain, not a personal one.", "ownerEmail");
    }
    if (error.message.includes("owner_email")) {
      return fail("Check the owner email address.", "ownerEmail");
    }
    if (error.message.includes("tool_media_url_ok")) {
      return fail("Every image and video URL must start with https://", "screenshotUrl");
    }
    if (error.message.includes("tool_links_url_ok")) {
      return fail("Every link must start with http:// or https://", "otherLinkUrl");
    }
    return fail("Could not save that. Please try again.");
  }

  revalidatePath("/developer/tools");
  revalidatePath("/developer");
  /* My Tools confirms by name. A redirect on its own leaves a person guessing
     which row is the one they just made, and whether it was saved or sent. */
  redirect(
    `/developer/tools?saved=${encodeURIComponent(d.name)}${send ? "&sent=1" : ""}`,
  );
}

/* -------------------------------------------------------------- editing */

/*
  Editing a tool the caller already owns.

  Deliberately the same shape as submitTool: same schema, same domain check,
  same upload verification, same echoed values on refusal. The only real
  differences are that the slug cannot move and that where it lands is not the
  caller's choice.

  WHERE IT LANDS IS public.update_tool'S DECISION, not this function's. A draft
  stays a draft; a live listing goes back to the review queue and off the
  catalogue, which is the founder's decision of 2026-09-17 and what keeps
  "approved" meaning somebody read what is actually public. The RPC returns the
  status it settled on, and this only reports it.

  Ownership is not checked here either. update_tool re-checks it, and a check
  in this action would be the kind that can be skipped by calling the RPC
  directly.
*/
export async function updateTool(
  _prev: DeveloperState,
  formData: FormData,
): Promise<DeveloperState> {
  const raw: Record<string, string | string[]> = {};
  for (const key of TOOL_TEXT_FIELDS) {
    const v = formData.get(key);
    raw[key] = typeof v === "string" ? v : "";
  }
  for (const key of TOOL_LIST_FIELDS) {
    raw[key] = formData.getAll(key).filter((v): v is string => typeof v === "string");
  }

  const str = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : "");
  const arr = (k: string) => (Array.isArray(raw[k]) ? (raw[k] as string[]) : []);

  const fail = (message: string, field?: string): DeveloperState => ({
    status: "error",
    message,
    field,
    values: raw,
    attempt: (_prev.attempt ?? 0) + 1,
  });

  const toolId = String(formData.get("toolId") ?? "");
  if (!UUID_RE.test(toolId)) return fail("That tool could not be found.");

  if (!isSupabaseConfigured()) return fail("Not connected.");

  /*
    The submission flag is NOT checked here, and that is on purpose. Pausing
    new submissions is about the front door. It should not strand somebody
    mid correction on a tool Celpare has already asked them to fix.
  */

  const parsed = toolSchema.safeParse({
    /* The slug is fixed and the form renders it read only, but a read only
       input still posts, and update_tool does not take one at all. Parsed so
       the schema stays one shape, then ignored. */
    slug: str("slug"),
    name: str("name"),
    tagline: str("tagline"),
    description: str("description"),
    websiteUrl: str("websiteUrl"),
    docsUrl: str("docsUrl"),
    demoUrl: str("demoUrl"),
    githubUrl: str("githubUrl"),
    logoUrl: str("logoUrl"),
    pricing: str("pricing"),
    pricingModel: str("pricingModel") === "" ? undefined : str("pricingModel"),
    tags: str("tags"),
    ownerEmail: str("ownerEmail"),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(issue?.message ?? "Please check the form.", issue?.path[0] as string);
  }

  const d = parsed.data;

  const site = canonicalDomain(d.websiteUrl);
  const mail = emailDomain(d.ownerEmail);

  if (!site) {
    return fail("Give the tool's website so the email can be checked against it.", "websiteUrl");
  }
  if (!mail) {
    return fail("Enter a work email address on the tool's own domain.", "ownerEmail");
  }
  if (FREE_EMAIL_DOMAINS.has(mail)) {
    return fail(
      `A personal address does not show you speak for ${site}. Use one on that domain, for example support@${site}.`,
      "ownerEmail",
    );
  }
  if (mail !== site && !mail.endsWith(`.${site}`)) {
    return fail(
      `That email is on ${mail}, and the tool's website is ${site}. The address has to be on the tool's own domain, for example support@${site}.`,
      "ownerEmail",
    );
  }

  const categories = arr("categories").filter((v) => UUID_RE.test(v)).slice(0, MAX_CATEGORIES);
  if (categories.length === 0) {
    return fail("Choose at least one category, so people can find it.", "categories");
  }

  const links: { kind: string; url: string }[] = [];
  if (d.demoUrl) links.push({ kind: "demo", url: d.demoUrl });
  if (d.githubUrl) links.push({ kind: "github", url: d.githubUrl });

  const otherKinds = arr("otherLinkKind");
  const otherUrls = arr("otherLinkUrl");
  for (let i = 0; i < otherUrls.length && i < MAX_OTHER_LINKS; i += 1) {
    const url = (otherUrls[i] ?? "").trim();
    const kind = (otherKinds[i] ?? "").trim();
    if (url === "") continue;
    if (!httpsish(url)) {
      return fail("Every other link must start with http:// or https://", "otherLinkUrl");
    }
    if (!(OTHER_LINK_KINDS as readonly string[]).includes(kind)) {
      return fail("Say what each of your other links is.", "otherLinkKind");
    }
    links.push({ kind, url });
  }

  const seenKinds = new Set<string>();
  for (const l of links) {
    if (seenKinds.has(l.kind)) {
      return fail(`You have two ${l.kind} links. A tool can have one of each.`, "otherLinkKind");
    }
    seenKinds.add(l.kind);
  }

  /* No cover. The kind still exists in the database, and tools submitted
     before 2026-09-18 still have their row, but nothing collects one any more
     and the profile stopped rendering it. See tools/[slug]/page.tsx. */
  const media: { kind: string; url: string; sort_order: number }[] = [];

  const shots = arr("screenshotUrl").map((v) => v.trim()).filter(Boolean).slice(0, MAX_SCREENSHOTS);
  for (const [i, url] of shots.entries()) {
    if (!httpsOnly(url)) {
      return fail("Every screenshot URL must start with https://", "screenshotUrl");
    }
    media.push({ kind: "screenshot", url, sort_order: i });
  }

  const videos = arr("videoUrl").map((v) => v.trim()).filter(Boolean).slice(0, MAX_VIDEOS);
  for (const [i, url] of videos.entries()) {
    if (!httpsOnly(url)) {
      return fail("Every video URL must start with https://", "videoUrl");
    }
    media.push({ kind: "video", url, sort_order: i });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("Sign in first.");

  const bad = await verifyUploads(
    [
      ...(d.logoUrl ? [{ url: d.logoUrl, field: "logoUrl" }] : []),
      ...shots.map((url) => ({ url, field: "screenshotUrl" })),
      ...videos.map((url) => ({ url, field: "videoUrl" })),
    ],
    user.id,
  );
  if (bad) {
    return fail(
      "One of your uploads could not be checked. Remove it and upload it again.",
      bad.field,
    );
  }

  const { data: ended, error } = await supabase.rpc("update_tool", {
    p_id: toolId,
    p_name: d.name,
    p_tagline: blank(d.tagline),
    p_description: d.description,
    p_website_url: blank(d.websiteUrl),
    p_docs_url: blank(d.docsUrl),
    p_logo_url: blank(d.logoUrl),
    p_pricing: blank(d.pricing),
    p_pricing_model: d.pricingModel ?? null,
    p_tags: list(d.tags ?? "", 12),
    p_owner_email: d.ownerEmail,
    p_categories: categories,
    p_links: links,
    p_media: media,
  });

  if (error) {
    console.error("[developer] tool update failed", error.code, error.message);
    if (error.message.includes("tool_not_found")) {
      return fail("That tool no longer exists.");
    }
    if (error.message.includes("wrong_state")) {
      return fail(
        "This one cannot be edited right now. A submission in the review queue is waiting on a decision, and a rejected one is closed.",
      );
    }
    if (error.message.includes("not_authorised") || error.code === "42501") {
      return fail("That is not yours to edit.");
    }
    if (error.code === "23505") {
      if (error.message.includes("tool_links_pkey")) {
        return fail("Two of your links are the same kind. A tool can have one of each.", "otherLinkKind");
      }
      return fail("Could not save that. Please try again.");
    }
    if (error.message.includes("owner_email_domain_mismatch")) {
      return fail("That email is not on the tool's own domain.", "ownerEmail");
    }
    if (error.message.includes("owner_email_free_provider")) {
      return fail("Use a work address on the tool's domain, not a personal one.", "ownerEmail");
    }
    if (error.message.includes("owner_email")) {
      return fail("Check the owner email address.", "ownerEmail");
    }
    if (error.message.includes("tool_media_url_ok")) {
      return fail("Every image and video URL must start with https://", "screenshotUrl");
    }
    if (error.message.includes("tool_links_url_ok")) {
      return fail("Every link must start with http:// or https://", "otherLinkUrl");
    }
    return fail("Could not save that. Please try again.");
  }

  revalidatePath("/developer/tools");
  revalidatePath("/developer");
  revalidatePath(`/tools/${d.slug}`);

  /* The RPC says where it landed. "Sent back for review" and "saved" are not
     the same event and a page that called both "saved" would be misreporting
     what just happened to somebody's live listing. */
  const requeued = ended === "pending";
  redirect(
    `/developer/tools?saved=${encodeURIComponent(d.name)}${requeued ? "&sent=1" : ""}`,
  );
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
      if (error.message.includes("account_not_active")) {
        return { status: "error", message: "Your account cannot publish right now." };
      }
      return { status: "error", message: "That is not yours to submit." };
    }
    if (error.message.includes("owner_email_required")) {
      return {
        status: "error",
        message: "This one has no owner email. Celpare cannot confirm who represents it, so it cannot be reviewed. Submit it again with a work address on the tool's domain.",
      };
    }
    if (error.message.includes("wrong_state")) {
      return { status: "error", message: "That is not waiting to be sent." };
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

/* ------------------------------------------------- launching a feature */

/*
  "Launch a new feature": the developer who submitted a tool posts a video or
  an image about something they have just shipped, and it appears in the tool's
  media. Founder instruction, 2026-09-17.

  THREE THINGS IT DELIBERATELY IS NOT:

  1. It is not a review. post_tool_update never touches tools.status, so a live
     tool stays live and a launch post is public the moment it is made. That
     was the explicit ask, and it is safe because a post adds news beside the
     listing rather than changing what the listing claims.
  2. It is not part of editing the tool. The edit form has no idea these exist,
     which is why tool_media.is_update exists: update_tool excludes them from
     the delete that otherwise replaces a tool's media wholesale.
  3. It is not open to anybody but the submitting developer. Ownership is
     checked in the RPC, not here, so calling it directly buys nothing.

  The media itself is an upload, verified the same way every other upload on a
  tool is: it has to be a file in our own buckets, in the caller's own folder,
  and the bytes have to be what they claim.
*/
export async function postToolUpdate(
  _prev: DeveloperState,
  formData: FormData,
): Promise<DeveloperState> {
  const raw: Record<string, string | string[]> = {
    caption: String(formData.get("caption") ?? ""),
    linkUrl: String(formData.get("linkUrl") ?? ""),
    updateVideoUrl: String(formData.get("updateVideoUrl") ?? ""),
    updateImageUrl: String(formData.get("updateImageUrl") ?? ""),
  };
  const str = (k: string) => (raw[k] as string) ?? "";

  const fail = (message: string, field?: string): DeveloperState => ({
    status: "error",
    message,
    field,
    values: raw,
    attempt: (_prev.attempt ?? 0) + 1,
  });

  const toolId = String(formData.get("toolId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  if (!UUID_RE.test(toolId)) return fail("That tool could not be found.");
  if (!isSupabaseConfigured()) return fail("Not connected.");

  const caption = str("caption").trim();
  if (caption === "") {
    return fail("Say what you shipped. That line is the announcement.", "caption");
  }
  if (caption.length > 200) {
    return fail("Keep it under 200 characters.", "caption");
  }

  const link = str("linkUrl").trim();
  if (link !== "" && !httpsOnly(link)) {
    return fail("A link must start with https://", "linkUrl");
  }

  /*
    A video, an image, or a link on its own. Founder, 2026-09-17: those three
    and nothing else, and never an arbitrary file.

    One of them, not two. A video AND an image is two announcements, and which
    one the profile should lead with is not a question this form should be
    asking somebody.
  */
  const video = str("updateVideoUrl").trim();
  const image = str("updateImageUrl").trim();

  if (video !== "" && image !== "") {
    return fail("Post a video or an image, not both. The other can be a second update.", "updateVideoUrl");
  }
  if (video === "" && image === "" && link === "") {
    return fail("Add a video, an image, or a link. An update needs one of the three.", "updateVideoUrl");
  }

  const kind = video !== "" ? "video" : image !== "" ? "screenshot" : "link";
  const url = video !== "" ? video : image;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("Sign in first.");

  /* Only when there is something uploaded to check. A link only post has no
     file of ours, which is the whole point of allowing one. */
  const bad =
    kind === "link"
      ? null
      : await verifyUploads(
          [{ url, field: kind === "video" ? "updateVideoUrl" : "updateImageUrl" }],
          user.id,
        );
  if (bad) {
    return fail(
      "That upload could not be checked. Remove it and upload it again.",
      bad.field,
    );
  }

  const { error } = await supabase.rpc("post_tool_update", {
    p_tool_id: toolId,
    p_kind: kind,
    p_url: kind === "link" ? null : url,
    p_caption: caption,
    p_link_url: link === "" ? null : link,
  });

  if (error) {
    console.error("[developer] tool update post failed", error.code, error.message);
    if (error.message.includes("tool_not_found")) return fail("That tool no longer exists.");
    if (error.message.includes("wrong_state")) {
      return fail("This submission is closed, so there is nothing to announce about it.");
    }
    if (error.message.includes("not_authorised") || error.code === "42501") {
      return fail("Only the developer who submitted this tool can post an update.");
    }
    if (error.message.includes("caption_required")) {
      return fail("Say what you shipped.", "caption");
    }
    if (error.message.includes("link_required")) {
      return fail("A link update needs a link.", "linkUrl");
    }
    if (error.message.includes("media_required")) {
      return fail("Add a video or an image.", "updateVideoUrl");
    }
    return fail("Could not post that. Please try again.");
  }

  revalidatePath("/developer/tools");
  if (slug) revalidatePath(`/tools/${slug}`);
  redirect(slug ? `/tools/${slug}` : "/developer/tools");
}

/* Removing one you posted. The RPC checks it is a launch post and that it is
   yours, so a forged id reaches nothing. */
export async function deleteToolUpdate(
  _prev: DeveloperState,
  formData: FormData,
): Promise<DeveloperState> {
  if (!isSupabaseConfigured()) return { status: "error", message: "Not connected." };

  const id = String(formData.get("id") ?? "");
  const slug = String(formData.get("slug") ?? "");
  if (!UUID_RE.test(id)) return { status: "error", message: "That did not work." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_tool_update", { p_id: id });

  if (error) {
    console.error("[developer] tool update delete failed", error.code, error.message);
    return { status: "error", message: "Could not remove that." };
  }

  if (slug) revalidatePath(`/tools/${slug}`);
  return { status: "success", message: "Removed." };
}
