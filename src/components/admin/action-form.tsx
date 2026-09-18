"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { IDLE, type AdminState } from "@/lib/admin/action-state";

/*
  Every admin action, through one component.

  A destructive action gets a confirmation step, per the ux guidance that
  irreversible actions are confirmed before they happen. It is an inline panel
  rather than window.confirm: a native dialog blocks the whole page, cannot
  carry the reason field the audit log needs, and cannot be styled or read
  properly by a screen reader.

  The reason field is here rather than only in SQL because the person typing it
  should see why it is required before they submit, not after. The RPC still
  refuses a missing reason independently, so this is the courtesy and the
  database is the control.
*/

export type ActionTone = "default" | "primary" | "danger";

const TONE: Record<ActionTone, string> = {
  default:
    "border-border bg-transparent text-foreground hover:bg-surface",
  primary:
    "border-transparent bg-accent text-on-accent hover:bg-[var(--celpare-lime-dim)]",
  /* Ink on a red surface rather than white on red: the brand's contrast rule is
     that a colour never carries white text, and it applies to the state colours
     for the same reason it applies to lime. */
  danger:
    "border-danger-surface bg-danger-surface text-danger-text hover:border-danger",
};

export function ActionForm({
  action,
  fields,
  label,
  tone = "default",
  confirm,
  requireReason = false,
  reasonLabel = "Reason",
  reasonHint = "This goes in the audit log and cannot be edited later.",
  disabled = false,
  disabledReason,
  size = "sm",
}: {
  action: (state: AdminState, formData: FormData) => Promise<AdminState>;
  /* Hidden inputs, hardcoded by the caller. Never spread from anything that
     came off a request. */
  fields: Record<string, string>;
  label: string;
  tone?: ActionTone;
  /* Present means confirm first. The text is the question, so it names what is
     about to happen rather than asking "are you sure". */
  confirm?: { title: string; body: string; confirmLabel?: string };
  requireReason?: boolean;
  reasonLabel?: string;
  reasonHint?: string;
  disabled?: boolean;
  /* Why the button is off. A disabled control with no explanation is a dead end
     somebody will assume is a bug. */
  disabledReason?: string;
  size?: "sm" | "xs";
}) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  const needsStep = Boolean(confirm) || requireReason;

  /*
    Close the panel once the action has landed. Leaving it open after a success
    invites a second identical submission, which for a suspension means two
    audit entries for one decision.

    Adjusted during render rather than in an effect. Setting state from an
    effect that watches state is a cascading render: React would paint the open
    panel with the success message, then immediately re-render it closed.
    Comparing against the last value seen does it in one pass.
  */
  const [seenStatus, setSeenStatus] = useState(state.status);
  if (state.status !== seenStatus) {
    setSeenStatus(state.status);
    if (state.status === "success") setOpen(false);
  }

  useEffect(() => {
    if (open) reasonRef.current?.focus();
  }, [open]);

  const button = cn(
    "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border font-medium transition-colors duration-200 ease-out disabled:pointer-events-none disabled:opacity-50",
    size === "xs" ? "h-8 px-2.5 text-[12px]" : "h-9 px-3 text-[13px]",
    TONE[tone],
  );

  if (disabled) {
    return (
      /* items-start, so the button keeps its own width. Without it the flex
         column stretches every child to the width of the widest, and a one
         line reason turned a 90px button into a 417px one. The reason is
         bounded too, so a long one wraps rather than widening the row. */
      <span className="inline-flex flex-col items-start gap-1">
        <button type="button" className={button} disabled aria-disabled>
          {label}
        </button>
        {disabledReason ? (
          <span className="max-w-[34ch] text-[11px] leading-snug text-muted">
            {disabledReason}
          </span>
        ) : null}
      </span>
    );
  }

  /* No confirmation and no reason: one button that submits. Used for the
     reversible, low consequence actions, where a confirmation step is friction
     that teaches people to click through confirmations. */
  if (!needsStep) {
    return (
      <form action={formAction} className="inline-flex flex-col gap-1">
        {Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <button type="submit" className={button} disabled={pending}>
          {pending ? "Working" : label}
        </button>
        <ActionMessage state={state} />
      </form>
    );
  }

  return (
    <div className="inline-flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={button}
        aria-expanded={open}
        aria-controls={panelId}
      >
        {label}
      </button>

      {open ? (
        <form
          id={panelId}
          action={formAction}
          className="mt-2 w-[min(420px,calc(100vw-3rem))] rounded-xl border border-border bg-background p-4"
        >
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}

          {confirm ? (
            <>
              <p className="text-[14px] font-medium">{confirm.title}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{confirm.body}</p>
            </>
          ) : null}

          {requireReason ? (
            <label className="mt-3 block">
              <span className="text-[12px] font-medium uppercase tracking-wide text-muted">
                {reasonLabel}
              </span>
              <textarea
                ref={reasonRef}
                name="reason"
                rows={3}
                required
                maxLength={1000}
                className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-[14px] text-foreground"
              />
              <span className="mt-1 block text-[11px] leading-snug text-muted">{reasonHint}</span>
            </label>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={pending}
              className={cn(
                "inline-flex h-9 cursor-pointer items-center rounded-lg border px-4 text-[13px] font-medium transition-colors duration-200 ease-out disabled:pointer-events-none disabled:opacity-50",
                TONE[tone === "default" ? "primary" : tone],
              )}
            >
              {pending ? "Working" : (confirm?.confirmLabel ?? label)}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-border px-3 text-[13px] text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
            >
              Cancel
            </button>
          </div>

          <ActionMessage state={state} />
        </form>
      ) : (
        <ActionMessage state={state} />
      )}
    </div>
  );
}

/*
  The result of an action.

  aria-live, because the change happens somewhere else on the page and a person
  using a screen reader has no reason to be looking at the button they pressed.
  Silent success is one of the ux failures this dashboard is meant to avoid.
*/
export function ActionMessage({ state }: { state: AdminState }) {
  if (state.status === "idle") return null;
  return (
    <p
      role="status"
      aria-live="polite"
      className={cn(
        "mt-2 text-[12px] leading-snug",
        state.status === "error" ? "text-danger-text" : "text-muted",
      )}
    >
      {state.message}
    </p>
  );
}

/*
  A select plus a reason, for the three actions that pick a value rather than
  toggling one: role, plan and status.

  Kept separate from ActionForm rather than adding a "fields can be inputs"
  mode, because a component that renders either hidden inputs or visible ones
  depending on a prop is two components sharing a name.
*/
export function ActionSelectForm({
  action,
  fields,
  name,
  legend,
  hint,
  options,
  current,
  submitLabel,
  requireReason = true,
  tone = "default",
  disabled = false,
  disabledReason,
}: {
  action: (state: AdminState, formData: FormData) => Promise<AdminState>;
  fields: Record<string, string>;
  name: string;
  legend: string;
  hint?: string;
  options: { value: string; label: string; description?: string }[];
  current: string;
  submitLabel: string;
  requireReason?: boolean;
  tone?: ActionTone;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  const [choice, setChoice] = useState(current);

  /*
    React 19 resets a form once its action completes, which would put the select
    back to its HTML default and disagree with what the server now holds.
    Keeping it controlled and re-seeding is what keeps the two in step: see the
    note in docs/RESUME.md section 9.

    Re-seeded during render rather than from an effect, for the same reason as
    above: an effect here would paint the stale choice and then correct it.
  */
  const [seen, setSeen] = useState({ current, status: state.status });
  if (seen.current !== current || seen.status !== state.status) {
    setSeen({ current, status: state.status });
    setChoice(current);
  }

  const chosen = options.find((o) => o.value === choice);
  const unchanged = choice === current;

  return (
    <form action={formAction} className="rounded-xl border border-border p-4">
      {Object.entries(fields).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}

      <fieldset disabled={disabled || pending}>
        <legend className="text-[13px] font-medium">{legend}</legend>
        {hint ? <p className="mt-1 text-[12px] leading-relaxed text-muted">{hint}</p> : null}

        <select
          name={name}
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          className="mt-3 h-9 w-full rounded-lg border border-border bg-background px-2.5 text-[13px] text-foreground"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {chosen?.description ? (
          <p className="mt-2 text-[12px] leading-relaxed text-muted">{chosen.description}</p>
        ) : null}

        {requireReason ? (
          <label className="mt-3 block">
            <span className="text-[12px] font-medium uppercase tracking-wide text-muted">
              Reason
            </span>
            <textarea
              name="reason"
              rows={2}
              required
              maxLength={1000}
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-[14px] text-foreground"
            />
            <span className="mt-1 block text-[11px] leading-snug text-muted">
              This goes in the audit log and cannot be edited later.
            </span>
          </label>
        ) : null}

        <button
          type="submit"
          disabled={unchanged}
          className={cn(
            "mt-3 inline-flex h-9 cursor-pointer items-center rounded-lg border px-4 text-[13px] font-medium transition-colors duration-200 ease-out disabled:pointer-events-none disabled:opacity-50",
            TONE[tone === "default" ? "primary" : tone],
          )}
        >
          {pending ? "Working" : submitLabel}
        </button>
      </fieldset>

      {disabled && disabledReason ? (
        <p className="mt-2 text-[12px] leading-snug text-muted">{disabledReason}</p>
      ) : null}
      <ActionMessage state={state} />
    </form>
  );
}
