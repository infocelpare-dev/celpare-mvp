"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormAlert } from "@/components/ui/field";
import { TextareaField } from "@/components/ui/textarea-field";
import { submitTool, updateTool, type DeveloperState } from "@/app/actions/developer";
import { MediaUpload } from "./media-upload";
import { cn } from "@/lib/utils";

/*
  Tool submission, rebuilt to the founder's brief of 2026-09-17.

  Three steps: the basics, then links and media, then a review of everything
  before anything is written. It replaces the single twelve field page 4S built,
  because a tool profile is now a whole page on /tools/[slug] and asking for it
  in one scroll was the reason most of that page had nothing in it.

  WHAT THIS FORM DOES NOT ASK FOR, deliberately: likes, dislikes, saves, shares,
  stars and reviews. Those are things the public does to a tool. A field for
  them would be a field for inventing them, which D13 and D30 have settled.

  Five behaviours are worth knowing before editing this file.

  1. EVERY STEP STAYS MOUNTED. Only the inactive ones are hidden. Unmounting a
     step would drop its inputs out of the FormData the action reads, so the
     whole submission would be whatever the last visible step contained.

  2. A REFUSED SUBMISSION KEEPS WHAT WAS TYPED. React 19 resets a form once its
     action completes, so the action echoes the values back and the form is
     KEYED on the attempt count. The key is the part that matters: an input that
     is already mounted ignores a changed defaultValue, so the fields have to
     mount again to pick the values up. Three steps of work is far too much to
     lose to a taken slug.

  3. REPEATABLE ROWS ARE KEYED BY ID, NEVER BY INDEX. These inputs are
     uncontrolled, so React reuses the DOM node at a given position. Keyed by
     index, deleting the first screenshot would leave its URL sitting in the
     box now labelled as the second one.

  4. LOGO, SCREENSHOTS AND VIDEOS ARE UPLOADS. Each is a MediaUpload,
     which sends the file straight from the browser to Supabase Storage and
     puts the resulting URL in a hidden input. The surrounding form never sees
     a file, so it stays an ordinary uncontrolled form and the action still
     receives URLs. What stops a bad file is listed in media-upload.tsx, and
     the control is in submitTool rather than in the browser.

  5. THE PREVIEW READS THE LIVE FORM, not React state. Everything here is
     uncontrolled, so the only honest source for "what did they actually type"
     is the form element itself, read on arrival at step three.

  IT DOES BOTH JOBS. With no toolId it submits a new tool; with one it edits
  that tool and posts to updateTool instead. The fields are identical, so the
  alternative was a second file that had to be kept in step with this one, and
  the one that gets forgotten is the second one.

  Every field, limit and error name comes from `toolSchema` in
  actions/developer.ts. If that schema changes, this file follows it.
*/

const ERROR_ID = "tool-form-error";

const STEPS = ["Basic information", "Links and media", "Review submission"] as const;

const MAX_SCREENSHOTS = 8;
const MAX_VIDEOS = 4;
const MAX_OTHER_LINKS = 6;
const MAX_CATEGORIES = 4;

/* Must match OTHER_LINK_KINDS in actions/developer.ts, which is itself the
   tool_links_kind_ok CHECK minus demo and github, since those two have fields
   of their own. */
const OTHER_LINK_KINDS: { value: string; label: string }[] = [
  { value: "other", label: "Other" },
  { value: "discord", label: "Discord" },
  { value: "x", label: "X" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "api", label: "API reference" },
  { value: "changelog", label: "Changelog" },
  { value: "pricing", label: "Pricing page" },
];

const selectBase =
  "h-11 w-full rounded-xl border border-border bg-background px-4 text-[16px] text-foreground disabled:opacity-50 sm:text-[15px]";

/* The only control the shared ui/ folder has no component for. Kept local
   rather than invented as a shared primitive. */
function SelectField({
  id,
  label,
  hint,
  invalid,
  children,
  ...props
}: React.ComponentProps<"select"> & {
  id: string;
  label: string;
  hint?: string;
  invalid?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[14px] font-medium text-foreground">
        {label}
      </label>
      <select
        id={id}
        aria-invalid={invalid || undefined}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={cn(selectBase, invalid && "border-foreground")}
        {...props}
      >
        {children}
      </select>
      {hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-[13px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/* The field an error names, in the words its label uses, so the summary can say
   where to go rather than printing a variable name at somebody. */
const FIELD_LABEL: Record<string, string> = {
  name: "Tool name",
  slug: "URL slug",
  tagline: "Tagline",
  description: "What it does",
  logoUrl: "Logo",
  categories: "Category",
  tags: "Hashtags",
  websiteUrl: "Website",
  ownerEmail: "Owner email",
  docsUrl: "Documentation",
  demoUrl: "Demo",
  githubUrl: "GitHub",
  otherLinkUrl: "Other links",
  otherLinkKind: "Other links",
  screenshotUrl: "Screenshots",
  videoUrl: "Videos",
  pricing: "Pricing detail",
  pricingModel: "Pricing model",
};

/* Which step a named field lives on, so a refusal can put somebody back where
   the problem is instead of on whichever step they happened to leave. */
const FIELD_STEP: Record<string, number> = {
  name: 0, slug: 0, tagline: 0, description: 0, logoUrl: 0,
  categories: 0, tags: 0,
  websiteUrl: 1, ownerEmail: 1, docsUrl: 1, demoUrl: 1, githubUrl: 1,
  otherLinkUrl: 1, otherLinkKind: 1, screenshotUrl: 1, videoUrl: 1,
  pricing: 1, pricingModel: 1,
};

export type CategoryOption = { id: string; name: string };

/* What the form starts with. Same shape the action echoes back on a refusal,
   so one lookup serves both and neither has to know about the other. */
export type ToolFormValues = Record<string, string | string[]>;

type Row = { id: number; value: string; kind?: string };

let rowSeq = 0;
const makeRow = (value = "", kind?: string): Row => ({ id: (rowSeq += 1), value, kind });

/* A repeatable list always shows at least one empty row, so there is something
   to type into before anybody presses Add. */
function seed(values: string | string[] | undefined): Row[] {
  const list = Array.isArray(values) ? values.filter(Boolean) : [];
  return list.length ? list.map((v) => makeRow(v)) : [makeRow()];
}

function seedPairs(
  urls: string | string[] | undefined,
  kinds: string | string[] | undefined,
): Row[] {
  const u = Array.isArray(urls) ? urls.filter(Boolean) : [];
  const k = Array.isArray(kinds) ? kinds : [];
  return u.length
    ? u.map((v, i) => makeRow(v, k[i] ?? "other"))
    : [makeRow("", "other")];
}

export function ToolSubmitForm({
  categories,
  initial,
  toolId,
  liveEdit,
}: {
  categories: CategoryOption[];
  /* Present when editing: the tool as it stands. Absent when submitting. */
  initial?: ToolFormValues;
  /* Present when editing. It is what switches the action, and it is only a
     hint: update_tool re-checks ownership itself and refuses a tool that is
     not the caller's, so a forged id here buys nothing. */
  toolId?: string;
  /* Editing something that is currently live. Saving takes it off the
     catalogue and back into the review queue, so the form says so before
     anybody presses the button rather than after. */
  liveEdit?: boolean;
}) {
  const editing = Boolean(toolId);

  const [state, action, pending] = useActionState<DeveloperState, FormData>(
    editing ? updateTool : submitTool,
    { status: "idle", message: "" },
  );

  const [step, setStep] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const slugRef = useRef<HTMLInputElement>(null);

  const invalid = (field: string) => state.status === "error" && state.field === field;

  /*
    What to show in a field, in order: what the action handed back after
    refusing, then what the tool already had, then empty.

    The order matters. A refusal has to win over the stored value, or a
    correction somebody just typed would be thrown away and replaced by the
    thing that was already wrong.
  */
  const was = (field: string) => {
    const v = state.values?.[field] ?? initial?.[field];
    return typeof v === "string" ? v : "";
  };
  const wasList = (field: string) => {
    const v = state.values?.[field] ?? initial?.[field];
    return Array.isArray(v) ? v : [];
  };

  const attempt = state.attempt ?? 0;

  /*
    Repeatable rows. Seeded from whatever the last refusal echoed back, and
    resynced whenever the attempt count moves, so a rejected submission returns
    with the same number of screenshot boxes the person had filled in.
  */
  const [shots, setShots] = useState<Row[]>(() => seed(initial?.screenshotUrl));
  const [videos, setVideos] = useState<Row[]>(() => seed(initial?.videoUrl));
  const [others, setOthers] = useState<Row[]>(() =>
    seedPairs(initial?.otherLinkUrl, initial?.otherLinkKind),
  );

  /*
    Resync during render, not in an effect.

    This is React's documented pattern for adjusting state when an input
    changes: compare against the last value handled, set, and let React re-run
    the render before it commits anything. The effect version of this painted
    the stale rows, then replaced them, which is a visible flash and the
    cascading render the lint rule exists to stop.

    Rows are rebuilt with fresh ids on purpose. Their inputs are uncontrolled,
    so a reused id would keep the DOM node it already had and quietly ignore the
    echoed defaultValue, which is the same trap the form key solves at the top.
  */
  const [syncedAttempt, setSyncedAttempt] = useState(0);
  if (syncedAttempt !== attempt) {
    setSyncedAttempt(attempt);

    const s = wasList("screenshotUrl");
    const v = wasList("videoUrl");
    const ou = wasList("otherLinkUrl");
    const ok = wasList("otherLinkKind");
    setShots(s.length ? s.map((x) => makeRow(x)) : [makeRow()]);
    setVideos(v.length ? v.map((x) => makeRow(x)) : [makeRow()]);
    setOthers(ou.length ? ou.map((x, i) => makeRow(x, ok[i] ?? "other")) : [makeRow("", "other")]);

    /*
      Put the person back on the step that caused the refusal. Somebody on the
      review step must not be left staring at an unchanged screen while the
      reason for the no sits two steps behind them.
    */
    const target = state.field ? FIELD_STEP[state.field] : undefined;
    if (target !== undefined) setStep(target);
  }

  /* Moving focus is a DOM call rather than state, so it stays an effect. The
     ux guidance rates a visual only error High severity: the summary has to be
     reachable, not merely present. */
  useEffect(() => {
    if (state.status !== "error") return;
    document.getElementById(ERROR_ID)?.focus();
  }, [state]);

  /*
    Fill the slug from the name, once, and only while the slug is still empty.
    Through a ref rather than controlled state on purpose: React 19 resets a
    form after its action completes, which fights a controlled input, and a
    person who types their own slug must never have it overwritten.
  */
  function suggestSlug(e: React.FocusEvent<HTMLInputElement>) {
    const el = slugRef.current;
    if (!el || el.value !== "") return;
    el.value = e.target.value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
  }

  /* ------------------------------------------------------------- preview */

  const [preview, setPreview] = useState<FormData | null>(null);

  const categoryName = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );

  /*
    Native validation, scoped to the step being left. checkValidity on the whole
    form would refuse to advance from step one because step two is empty, and
    reportValidity is what draws the browser's own message next to the field.
  */
  function leaveStep(next: number) {
    const form = formRef.current;
    if (!form) return;

    if (next > step) {
      const current = form.querySelector<HTMLElement>(`[data-step="${step}"]`);
      const controls = current?.querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >("input, select, textarea");
      for (const el of controls ?? []) {
        if (!el.checkValidity()) {
          el.reportValidity();
          return;
        }
      }
      /* Category is checkboxes, and `required` on a checkbox group means "this
         one box", not "at least one of them". The server refuses an empty set
         too; this is so nobody reaches the review step to find out. */
      if (step === 0) {
        const picked = form.querySelectorAll<HTMLInputElement>(
          'input[name="categories"]:checked',
        );
        if (picked.length === 0) {
          document.getElementById("categories-group")?.scrollIntoView({ block: "center" });
          setCategoryError(true);
          return;
        }
      }
    }

    if (next === STEPS.length - 1) setPreview(new FormData(form));
    setCategoryError(false);
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const [categoryError, setCategoryError] = useState(false);

  const errorField = state.status === "error" ? state.field : undefined;

  const pv = (k: string) => {
    const v = preview?.get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  const pvAll = (k: string) =>
    (preview?.getAll(k) ?? [])
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim())
      .filter(Boolean);

  return (
    <form
      ref={formRef}
      /* Remounts the fields so the echoed defaults are applied. See note 2 at
         the top of the file. */
      key={attempt}
      action={action}
      className="mt-8"
    >
      {toolId ? <input type="hidden" name="toolId" value={toolId} /> : null}
      <Steps current={step} onGo={leaveStep} />

      {state.message ? (
        <div className="mt-6">
          <FormAlert id={ERROR_ID} tone="error">
            {state.message}
            {errorField && FIELD_LABEL[errorField] ? (
              <>
                {" "}
                <a href={`#${errorField}`} className="underline underline-offset-2">
                  Go to {FIELD_LABEL[errorField]}
                </a>
                .
              </>
            ) : null}
          </FormAlert>
        </div>
      ) : null}

      {/* ---------------------------------------------- step 1, the basics */}

      <section data-step="0" hidden={step !== 0} className="mt-8 space-y-10">
        <fieldset>
          <legend className="font-display text-[17px] font-semibold">
            About the tool
          </legend>

          <div className="mt-5 space-y-5">
            <Field
              id="name"
              name="name"
              label="Tool name"
              required
              maxLength={120}
              defaultValue={was("name")}
              onBlur={suggestSlug}
              invalid={invalid("name")}
              hint="The name people know it by."
            />

            {/*
              The slug is fixed once it exists. It is not in the client UPDATE
              grant and update_tool does not take it, because it is the tool's
              public address: changing it breaks every link anybody has already
              shared. Shown read only rather than hidden, so nobody wonders
              where it went.
            */}
            <Field
              id="slug"
              name="slug"
              ref={slugRef}
              label="URL slug"
              required={!editing}
              readOnly={editing}
              minLength={2}
              maxLength={60}
              pattern="[a-z0-9\-]{2,60}"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              defaultValue={was("slug")}
              invalid={invalid("slug")}
              hint={
                editing
                  ? "Fixed. Changing it would break every link already shared."
                  : "Its address on Celpare: celpare.com/tools/your-slug"
              }
            />

            <Field
              id="tagline"
              name="tagline"
              label="Bio or tagline"
              maxLength={200}
              defaultValue={was("tagline")}
              invalid={invalid("tagline")}
              hint="One line under the name. What it is, in a breath."
            />

            <TextareaField
              id="description"
              name="description"
              label="What it does"
              required
              rows={7}
              limit={4000}
              defaultValue={was("description")}
              invalid={invalid("description")}
              hint="The main body of the profile. What it is for, who it suits, what makes it different."
            />
          </div>
        </fieldset>

        {/*
          Logo only. The cover upload was removed on founder instruction
          2026-09-18, alongside the banner on the public profile: asking for a
          wide image the profile no longer renders would be collecting
          something for nowhere. Screenshots still take wide images and are
          still shown.
        */}
        <fieldset>
          <legend className="font-display text-[17px] font-semibold">Logo</legend>

          <div className="mt-5">
            <div id="logoUrl">
              <MediaUpload
                name="logoUrl"
                kind="image"
                shape="square"
                label="Logo"
                defaultValue={was("logoUrl")}
                invalid={invalid("logoUrl")}
                hint="Square works best. It is the centrepiece of the profile and appears beside the name everywhere else."
              />
            </div>
          </div>
        </fieldset>

        <fieldset id="categories-group">
          <legend className="font-display text-[17px] font-semibold">
            Category and hashtags
          </legend>

          <div className="mt-5 space-y-5">
            <div>
              <p
                id="categories"
                className="mb-2 text-[14px] font-medium text-foreground"
              >
                Category
              </p>
              <div
                role="group"
                aria-labelledby="categories"
                aria-describedby="categories-hint"
                className="grid grid-cols-1 gap-2 sm:grid-cols-2"
              >
                {categories.map((c) => (
                  <label
                    key={c.id}
                    /* htmlFor and siblings rather than a wrapping label around
                       its own input: a label that wraps its input double fires
                       the change event. */
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-border px-4 py-3 text-[15px] transition-colors duration-200 ease-out hover:bg-surface"
                  >
                    <input
                      type="checkbox"
                      name="categories"
                      value={c.id}
                      defaultChecked={wasList("categories").includes(c.id)}
                      className="h-4 w-4 shrink-0 accent-[var(--celpare-lime)]"
                    />
                    {c.name}
                  </label>
                ))}
              </div>
              <p
                id="categories-hint"
                className={cn(
                  "mt-2 text-[13px]",
                  categoryError || invalid("categories") ? "text-foreground" : "text-muted",
                )}
                role={categoryError ? "alert" : undefined}
              >
                {categoryError || invalid("categories")
                  ? "Choose at least one category, so people can find it."
                  : `Pick up to ${MAX_CATEGORIES}. This is how people browse to it.`}
              </p>
            </div>

            <Field
              id="tags"
              name="tags"
              label="Hashtags"
              maxLength={600}
              defaultValue={was("tags")}
              invalid={invalid("tags")}
              hint="Comma separated, up to 12. For example: writing, summarising, research"
            />
          </div>
        </fieldset>
      </section>

      {/* ------------------------------------------ step 2, links and media */}

      <section data-step="1" hidden={step !== 1} className="mt-8 space-y-10">
        <fieldset>
          <legend className="font-display text-[17px] font-semibold">
            Where it lives
          </legend>

          <div className="mt-5 space-y-5">
            <Field
              id="websiteUrl"
              name="websiteUrl"
              type="url"
              label="Website"
              required
              inputMode="url"
              maxLength={2048}
              placeholder="https://example.com"
              defaultValue={was("websiteUrl")}
              invalid={invalid("websiteUrl")}
              hint="The tool's own site, an App Store page or a Play Store page."
            />

            <Field
              id="ownerEmail"
              name="ownerEmail"
              type="email"
              label="Owner email"
              required
              inputMode="email"
              maxLength={254}
              autoCapitalize="none"
              spellCheck={false}
              placeholder="you@example.com"
              defaultValue={was("ownerEmail")}
              invalid={invalid("ownerEmail")}
              hint="A work address on the tool's own domain. Celpare writes to it to confirm you represent the tool, and never shows it publicly."
            />

            <Field
              id="demoUrl"
              name="demoUrl"
              type="url"
              label="Demo link"
              inputMode="url"
              maxLength={2048}
              placeholder="https://example.com/demo"
              defaultValue={was("demoUrl")}
              invalid={invalid("demoUrl")}
            />

            <Field
              id="docsUrl"
              name="docsUrl"
              type="url"
              label="Documentation link"
              inputMode="url"
              maxLength={2048}
              placeholder="https://docs.example.com"
              defaultValue={was("docsUrl")}
              invalid={invalid("docsUrl")}
            />

            <Field
              id="githubUrl"
              name="githubUrl"
              type="url"
              label="GitHub link"
              inputMode="url"
              maxLength={2048}
              placeholder="https://github.com/you/project"
              defaultValue={was("githubUrl")}
              invalid={invalid("githubUrl")}
            />
          </div>
        </fieldset>

        <fieldset>
          <legend className="font-display text-[17px] font-semibold">
            Other links
          </legend>
          <p className="mt-1.5 text-[13px] text-muted">
            One of each kind. Discord, X, LinkedIn, an API reference, a
            changelog, a pricing page, or anything else worth linking.
          </p>

          <div className="mt-5 space-y-3">
            {others.map((row, i) => (
              <div key={row.id} className="flex gap-2">
                <select
                  name="otherLinkKind"
                  defaultValue={row.kind ?? "other"}
                  aria-label={`Kind of other link ${i + 1}`}
                  className={cn(selectBase, "w-[132px] shrink-0 px-3")}
                >
                  {OTHER_LINK_KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
                <input
                  id={i === 0 ? "otherLinkUrl" : undefined}
                  name="otherLinkUrl"
                  type="url"
                  inputMode="url"
                  maxLength={2048}
                  placeholder="https://"
                  defaultValue={row.value}
                  aria-label={`Other link ${i + 1}`}
                  aria-invalid={invalid("otherLinkUrl") || undefined}
                  className="h-11 w-full rounded-xl border border-border bg-background px-4 text-[15px] text-foreground"
                />
                <RemoveRow
                  label={`Remove other link ${i + 1}`}
                  disabled={others.length === 1}
                  onClick={() => setOthers((r) => r.filter((x) => x.id !== row.id))}
                />
              </div>
            ))}
            <AddRow
              label="Add another link"
              disabled={others.length >= MAX_OTHER_LINKS}
              onClick={() => setOthers((r) => [...r, makeRow("", "other")])}
            />
          </div>
        </fieldset>

        <fieldset>
          <legend className="font-display text-[17px] font-semibold">
            Screenshots and videos
          </legend>
          <p className="mt-1.5 text-[13px] text-muted">
            This is also the media feed for your tool: upload a new screenshot
            or clip here whenever you ship a feature, and it appears on the
            profile.
          </p>

          <div className="mt-5 space-y-4" id="screenshotUrl">
            <p className="text-[14px] font-medium text-foreground">Screenshots</p>
            {shots.map((row, i) => (
              <MediaUpload
                key={row.id}
                name="screenshotUrl"
                kind="image"
                label={`Screenshot ${i + 1}`}
                defaultValue={row.value}
                invalid={invalid("screenshotUrl")}
                onRemoveRow={
                  shots.length === 1
                    ? undefined
                    : () => setShots((r) => r.filter((x) => x.id !== row.id))
                }
                removeRowLabel={`Remove screenshot ${i + 1}`}
              />
            ))}
            <AddRow
              label="Add a screenshot"
              disabled={shots.length >= MAX_SCREENSHOTS}
              onClick={() => setShots((r) => [...r, makeRow()])}
            />
          </div>

          <div className="mt-6 space-y-4" id="videoUrl">
            <p className="text-[14px] font-medium text-foreground">Videos</p>
            {videos.map((row, i) => (
              <MediaUpload
                key={row.id}
                name="videoUrl"
                kind="video"
                label={`Video ${i + 1}`}
                defaultValue={row.value}
                invalid={invalid("videoUrl")}
                onRemoveRow={
                  videos.length === 1
                    ? undefined
                    : () => setVideos((r) => r.filter((x) => x.id !== row.id))
                }
                removeRowLabel={`Remove video ${i + 1}`}
              />
            ))}
            <AddRow
              label="Add a video"
              disabled={videos.length >= MAX_VIDEOS}
              onClick={() => setVideos((r) => [...r, makeRow()])}
            />
          </div>
        </fieldset>

        <fieldset>
          <legend className="font-display text-[17px] font-semibold">Price</legend>

          <div className="mt-5 space-y-5">
            <SelectField
              id="pricingModel"
              name="pricingModel"
              label="Pricing model"
              defaultValue={was("pricingModel")}
              invalid={invalid("pricingModel")}
              hint="Leave it blank if you would rather not say yet."
            >
              <option value="">Not saying yet</option>
              <option value="free">Free</option>
              <option value="freemium">Freemium</option>
              <option value="paid">Paid</option>
              <option value="enterprise">Enterprise</option>
            </SelectField>

            <Field
              id="pricing"
              name="pricing"
              label="Pricing detail"
              maxLength={300}
              defaultValue={was("pricing")}
              invalid={invalid("pricing")}
              hint="For example: free tier, then 20 dollars a month per seat."
            />
          </div>
        </fieldset>
      </section>

      {/* -------------------------------------------------- step 3, review */}

      <section data-step="2" hidden={step !== 2} className="mt-8">
        <h2 className="font-display text-[17px] font-semibold">
          Review your submission
        </h2>
        <p className="mt-1.5 text-[13px] text-muted">
          {editing
            ? "This is everything as it will be saved."
            : "This is everything you entered. Nothing is public yet, and nothing is published by submitting."}
        </p>

        <div className="mt-6 divide-y divide-border rounded-xl border border-border">
          <PreviewRow label="Tool name" value={pv("name")} />
          <PreviewRow label="URL slug" value={pv("slug") && `/tools/${pv("slug")}`} />
          <PreviewRow label="Bio or tagline" value={pv("tagline")} />
          <PreviewRow label="What it does" value={pv("description")} multiline />
          <PreviewRow label="Logo" value={pv("logoUrl")} link />
          <PreviewRow
            label="Category"
            value={pvAll("categories").map((id) => categoryName.get(id) ?? id).join(", ")}
          />
          <PreviewRow label="Hashtags" value={pv("tags")} />
          <PreviewRow label="Website" value={pv("websiteUrl")} link />
          <PreviewRow label="Owner email" value={pv("ownerEmail")} />
          <PreviewRow label="Demo" value={pv("demoUrl")} link />
          <PreviewRow label="Documentation" value={pv("docsUrl")} link />
          <PreviewRow label="GitHub" value={pv("githubUrl")} link />
          <PreviewRow label="Other links" values={otherPreview(preview)} />
          <PreviewRow label="Screenshots" values={pvAll("screenshotUrl")} />
          <PreviewRow label="Videos" values={pvAll("videoUrl")} />
          <PreviewRow label="Pricing model" value={pricingLabel(pv("pricingModel"))} />
          <PreviewRow label="Pricing detail" value={pv("pricing")} />
        </div>

        {editing ? (
          <p className="mt-5 text-[13px] text-muted">
            {liveEdit ? (
              <>
                <strong className="font-medium text-foreground">
                  This tool is live.
                </strong>{" "}
                Saving takes it out of the public catalogue and puts it back in
                the review queue, and it returns once Celpare approves it again.
                That is how an approved listing keeps meaning that somebody read
                what is actually on it.
              </>
            ) : (
              "Saving keeps this where it is. Send it for review from My Tools when it is ready."
            )}
          </p>
        ) : (
          <p className="mt-5 text-[13px] text-muted">
            <strong className="font-medium text-foreground">Save draft</strong>{" "}
            keeps this private to you and changes nothing else.{" "}
            <strong className="font-medium text-foreground">Submit tool</strong>{" "}
            sends it to Celpare to be reviewed. A reviewer writes to your owner
            email to confirm you represent the tool. It does not go live on
            submission.
          </p>
        )}
      </section>

      {/* ---------------------------------------------------------- actions */}

      <div className="mt-10 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center">
        {step > 0 ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => leaveStep(step - 1)}
            disabled={pending}
            className="sm:w-auto"
          >
            Back
          </Button>
        ) : null}

        <div className="flex flex-col gap-3 sm:ml-auto sm:flex-row">
          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={() => leaveStep(step + 1)}>
              Continue
            </Button>
          ) : editing ? (
            /* One button. Where an edit lands is not the owner's choice: a
               draft stays a draft and a live listing goes back to the queue,
               and update_tool is what decides, not this form. */
            <Button type="submit" disabled={pending}>
              {pending
                ? "Saving..."
                : liveEdit
                  ? "Save and send for review"
                  : "Save changes"}
            </Button>
          ) : (
            <>
              <Button
                type="submit"
                name="intent"
                value="draft"
                variant="outline"
                disabled={pending}
              >
                {pending ? "Saving..." : "Save draft"}
              </Button>
              <Button type="submit" name="intent" value="submit" disabled={pending}>
                {pending ? "Submitting..." : "Submit tool"}
              </Button>
            </>
          )}
        </div>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ pieces */

function Steps({ current, onGo }: { current: number; onGo: (n: number) => void }) {
  return (
    <nav aria-label="Submission steps">
      <ol className="flex flex-col gap-2 sm:flex-row sm:gap-3">
        {STEPS.map((label, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={label} className="flex-1">
              <button
                type="button"
                /* Going back is free, going forward is not: leaveStep runs the
                   current step's validation, so this cannot be used to skip
                   past a required field. */
                onClick={() => onGo(i)}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl border px-4 py-3 text-left transition-colors duration-200 ease-out",
                  active
                    ? "border-foreground bg-surface"
                    : "border-border hover:bg-surface",
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold",
                    active || done
                      ? "bg-accent text-on-accent"
                      : "border border-border text-muted",
                  )}
                  aria-hidden
                >
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] uppercase tracking-wide text-muted">
                    Step {i + 1} of {STEPS.length}
                  </span>
                  <span
                    className={cn(
                      "block truncate text-[14px]",
                      active ? "font-medium text-foreground" : "text-muted",
                    )}
                  >
                    {label}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function AddRow({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex cursor-pointer items-center gap-1.5 text-[14px] text-muted transition-colors duration-200 ease-out hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Plus className="h-4 w-4" aria-hidden />
      {label}
    </button>
  );
}

function RemoveRow({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-border text-muted transition-colors duration-200 ease-out hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
    >
      <X className="h-4 w-4" aria-hidden />
    </button>
  );
}

/* Zips the two parallel "other link" inputs back into pairs for the preview.
   They are read by index because that is how the action reads them too. */
function otherPreview(fd: FormData | null): string[] {
  if (!fd) return [];
  const kinds = fd.getAll("otherLinkKind").filter((v): v is string => typeof v === "string");
  const urls = fd.getAll("otherLinkUrl").filter((v): v is string => typeof v === "string");
  const out: string[] = [];
  for (let i = 0; i < urls.length; i += 1) {
    const url = (urls[i] ?? "").trim();
    if (!url) continue;
    const kind = OTHER_LINK_KINDS.find((k) => k.value === kinds[i])?.label ?? "Other";
    out.push(`${kind}: ${url}`);
  }
  return out;
}

function pricingLabel(v: string): string {
  const map: Record<string, string> = {
    free: "Free",
    freemium: "Freemium",
    paid: "Paid",
    enterprise: "Enterprise",
  };
  return map[v] ?? "";
}

/*
  One reviewed value. An empty one still renders its label and says so, because
  the point of this step is seeing what you have NOT filled in as much as what
  you have.
*/
function PreviewRow({
  label,
  value,
  values,
  link,
  multiline,
}: {
  label: string;
  value?: string;
  values?: string[];
  link?: boolean;
  multiline?: boolean;
}) {
  const list = values ?? (value ? [value] : []);
  const empty = list.length === 0;

  return (
    <div className="grid grid-cols-1 gap-1 px-4 py-3.5 sm:grid-cols-[180px_1fr] sm:gap-4">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd
        className={cn(
          "min-w-0 text-[15px]",
          empty ? "text-muted" : "text-foreground",
          multiline && "whitespace-pre-wrap",
        )}
      >
        {empty ? (
          <span className="italic">Not given</span>
        ) : (
          <ul className="space-y-1">
            {list.map((v, i) => (
              <li key={`${v}-${i}`} className="break-words">
                {link ? (
                  /* Rendered as text, never as a live anchor. Nothing here has
                     been reviewed yet, and a preview of your own draft is not a
                     reason to put a clickable unvetted URL on the page. */
                  <span className="break-all">{v}</span>
                ) : (
                  v
                )}
              </li>
            ))}
          </ul>
        )}
      </dd>
    </div>
  );
}
