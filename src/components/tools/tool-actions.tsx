"use client";

import { useActionState, useState } from "react";
import { ThumbsUp, ThumbsDown, Share2, Flag, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { SaveToCollection } from "@/components/collections/save-to-collection";
import { Button } from "@/components/ui/button";
import {
  reactToTool,
  reportTool,
  type ToolState,
} from "@/app/actions/tool";

/*
  Like, dislike, save, share, report.

  Not optimistic. Every one of these is a database write whose refusal is
  meaningful: a suspended account, a duplicate, a lost session. Painting the
  result before the server agrees would show a person a like that did not
  happen, and rolling it back afterwards is a worse experience than waiting
  300ms. The counts come from trigger maintained columns, so what renders after
  the revalidate is the real number rather than a guess.

  THE DISLIKE COUNT IS NEVER SHOWN. Founder decision: the signal is recorded
  and stays private to the tool's owner and staff. The column is not even in
  the client select grant, so this component could not display it if it tried.
*/

const IDLE: ToolState = { status: "idle", message: "" };

function ActionButton({
  active,
  disabled,
  onClick,
  label,
  count,
  children,
  pressed,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  label: string;
  count?: number;
  children: React.ReactNode;
  pressed?: boolean;
}) {
  return (
    <button
      type="submit"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      aria-label={label}
      className={cn(
        "inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-[14px] transition-colors duration-200 ease-out disabled:pointer-events-none disabled:opacity-50",
        active
          ? "border-transparent bg-accent text-on-accent"
          : "border-border text-foreground hover:bg-surface",
      )}
    >
      {children}
      <span>{label}</span>
      {/* Hidden at zero, per the post card rule: a zero is not information, it
          is a reminder that nobody has done it. */}
      {count !== undefined && count > 0 ? (
        <span className="tabular-nums">{count}</span>
      ) : null}
    </button>
  );
}

export function ToolActions({
  toolId,
  slug,
  likeCount,
  reaction,
  saved,
  reported,
  signedIn,
  shareUrl,
}: {
  toolId: string;
  slug: string;
  likeCount: number;
  reaction: 1 | -1 | null;
  saved: boolean;
  reported: boolean;
  signedIn: boolean;
  shareUrl: string;
}) {
  const [reactState, react, reactPending] = useActionState(reactToTool, IDLE);
  const [copied, setCopied] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const message = reactState.message;

  async function share() {
    /* The canonical public URL, not window.location, so a share from a page
       reached with tracking parameters still hands over the clean address. */
    try {
      if (navigator.share) {
        await navigator.share({ url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* A cancelled share sheet and a blocked clipboard both land here and
         neither is an error worth showing. */
    }
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-2">
        <form action={react} className="contents">
          <input type="hidden" name="toolId" value={toolId} />
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="value" value="1" />
          <ActionButton
            label="Like"
            count={likeCount}
            active={reaction === 1}
            pressed={reaction === 1}
            disabled={reactPending || !signedIn}
          >
            <ThumbsUp className="size-4" aria-hidden />
          </ActionButton>
        </form>

        <form action={react} className="contents">
          <input type="hidden" name="toolId" value={toolId} />
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="value" value="-1" />
          <ActionButton
            label="Dislike"
            active={reaction === -1}
            pressed={reaction === -1}
            disabled={reactPending || !signedIn}
          >
            <ThumbsDown className="size-4" aria-hidden />
          </ActionButton>
        </form>

        {/*
          SAVE OPENS THE PICKER, it does not write. Founder decision 2026-09-21:
          tapping Save shows your collections and the tool is saved only when a
          row is toggled. There is no separate saved list to fall back on, so a
          tool is saved BY being filed, and the database mirrors that membership
          into user_saved_tools rather than the other way round.
        */}
        <SaveToCollection
          entityType="tool"
          entityId={toolId}
          initialSaved={saved}
          signedIn={signedIn}
        />

        <button
          type="button"
          onClick={share}
          className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-[14px] transition-colors duration-200 ease-out hover:bg-surface"
        >
          {copied ? <Check className="size-4" aria-hidden /> : <Share2 className="size-4" aria-hidden />}
          <span>{copied ? "Link copied" : "Share"}</span>
        </button>

        {signedIn ? (
          <button
            type="button"
            onClick={() => setReportOpen((v) => !v)}
            aria-expanded={reportOpen}
            className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-[14px] text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
          >
            <Flag className="size-4" aria-hidden />
            <span>{reported ? "Reported" : "Report"}</span>
          </button>
        ) : null}
      </div>

      {!signedIn ? (
        <p className="mt-2 text-[13px] text-muted">
          <a href="/get-started" className="underline underline-offset-2">
            Sign in
          </a>{" "}
          to like, save or review this tool.
        </p>
      ) : null}

      {message ? (
        <p role="status" className="mt-2 text-[13px] text-muted">
          {message}
        </p>
      ) : null}

      {reportOpen && signedIn ? (
        <ReportPanel
          toolId={toolId}
          slug={slug}
          reported={reported}
          onDone={() => setReportOpen(false)}
        />
      ) : null}
    </div>
  );
}

const REASONS: { value: string; label: string }[] = [
  { value: "spam", label: "Spam or misleading" },
  { value: "illegal", label: "Illegal or harmful" },
  { value: "security", label: "Security concern" },
  { value: "abuse", label: "Abusive content" },
  { value: "offtopic", label: "Not an AI tool" },
  { value: "other", label: "Something else" },
];

function ReportPanel({
  toolId,
  slug,
  reported,
  onDone,
}: {
  toolId: string;
  slug: string;
  reported: boolean;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(reportTool, IDLE);

  if (reported && state.status === "idle") {
    return (
      <div className="mt-3 w-[min(440px,100%)] rounded-xl border border-border p-4">
        <p className="text-[13px] leading-relaxed text-muted">
          You have already reported this tool. It is with Celpare, and reporting
          it again would not move it up the queue.
        </p>
      </div>
    );
  }

  if (state.status === "success") {
    return (
      <div className="mt-3 w-[min(440px,100%)] rounded-xl border border-border p-4">
        <p role="status" className="text-[13px] leading-relaxed">
          {state.message}
        </p>
        <button
          type="button"
          onClick={onDone}
          className="mt-3 cursor-pointer text-[13px] underline underline-offset-4 text-muted hover:text-foreground"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="mt-3 w-[min(440px,100%)] rounded-xl border border-border p-4">
      <input type="hidden" name="toolId" value={toolId} />
      <input type="hidden" name="slug" value={slug} />

      <p className="text-[14px] font-medium">Report this tool</p>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        This goes to Celpare moderation. Reporting is not a dislike: use it when
        something is wrong with the listing itself.
      </p>

      <label htmlFor="report-reason" className="mt-3 block text-[13px] font-medium">
        Reason
      </label>
      <select
        id="report-reason"
        name="reason"
        required
        defaultValue=""
        className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-[14px]"
      >
        <option value="" disabled>
          Choose one
        </option>
        {REASONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>

      <label htmlFor="report-note" className="mt-3 block text-[13px] font-medium">
        Anything else <span className="font-normal text-muted">(optional)</span>
      </label>
      <textarea
        id="report-note"
        name="note"
        rows={3}
        maxLength={500}
        className="mt-1.5 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-[14px]"
      />

      {state.status === "error" ? (
        <p role="alert" className="mt-2 text-[13px]">
          {state.message}
        </p>
      ) : null}

      <div className="mt-3 flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Sending" : "Send report"}
        </Button>
        <button
          type="button"
          onClick={onDone}
          className="cursor-pointer text-[13px] text-muted underline underline-offset-4 hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
