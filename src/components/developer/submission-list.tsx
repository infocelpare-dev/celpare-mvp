"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { sendForReview, type DeveloperState } from "@/app/actions/developer";
import type {
  DeveloperModel,
  DeveloperTool,
  SubmissionStatus,
} from "@/lib/developer/queries";

/*
  One list for tools and models, because the lifecycle is identical and two
  copies would drift.

  Status is rendered, never edited. There is no control here that changes it
  except "Send for review", which goes through an RPC that re-checks ownership
  and the current state server side. A developer cannot approve anything from
  this screen, or from a forged request, because status is in no client grant.
*/

const TONE: Record<SubmissionStatus, "neutral" | "accent"> = {
  draft: "neutral",
  pending: "neutral",
  changes_required: "neutral",
  approved: "accent",
  rejected: "neutral",
};

const EXPLAIN: Record<SubmissionStatus, string> = {
  draft: "Only you can see this. Send it for review when it is ready.",
  pending: "With Celpare for review. You cannot edit it while it is in the queue.",
  changes_required: "Review sent it back. Edit it, then send it again.",
  approved: "Live in the catalogue.",
  rejected: "Not accepted. The review decision is final for this submission.",
};

const LABEL: Record<SubmissionStatus, string> = {
  draft: "Draft",
  pending: "Pending review",
  changes_required: "Changes required",
  approved: "Approved",
  rejected: "Rejected",
};

function when(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function SubmissionList({
  kind,
  tools,
  models,
}: {
  kind: "tool" | "model";
  tools?: DeveloperTool[];
  models?: DeveloperModel[];
}) {
  const rows = kind === "tool" ? (tools ?? []) : (models ?? []);

  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.id}>
          <Card className="p-4 sm:p-5">
            <div className="flex items-start gap-3">
              {kind === "tool" ? (
                <Logo
                  name={row.name}
                  logoUrl={(row as DeveloperTool).logo_url}
                />
              ) : null}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{row.name}</span>
                  <Badge tone={TONE[row.status]}>{LABEL[row.status]}</Badge>
                  {kind === "tool" && (row as DeveloperTool).verified ? (
                    <Badge tone="accent">Verified</Badge>
                  ) : null}
                </div>

                <p className="mt-1 text-[13px] leading-relaxed text-muted">
                  {EXPLAIN[row.status]}
                </p>

                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
                  {kind === "model" && (row as DeveloperModel).provider ? (
                    <span>{(row as DeveloperModel).provider}</span>
                  ) : null}
                  {kind === "tool" && (row as DeveloperTool).categories?.length ? (
                    <span>{(row as DeveloperTool).categories!.join(", ")}</span>
                  ) : null}
                  <span>Submitted {when(row.submitted_at)}</span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {row.status === "approved" && kind === "tool" ? (
                    <Link
                      href={`/tools/${row.slug}`}
                      className="text-[14px] underline underline-offset-4 hover:text-muted"
                    >
                      View in catalogue
                    </Link>
                  ) : null}

                  {row.status === "draft" || row.status === "changes_required" ? (
                    <SendForReview kind={kind} id={row.id} />
                  ) : null}
                </div>
              </div>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function SendForReview({ kind, id }: { kind: "tool" | "model"; id: string }) {
  const [state, action, pending] = useActionState<DeveloperState, FormData>(
    sendForReview,
    { status: "idle", message: "" },
  );

  return (
    <form action={action} className="flex items-center gap-3">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Sending" : "Send for review"}
      </Button>
      <span role="status" aria-atomic="true" className="text-[13px] text-muted">
        {state.message}
      </span>
    </form>
  );
}

function Logo({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  if (logoUrl) {
    /* A plain img, following the monogram in ask/tool-cards.tsx: these are
       third party hosts and next/image would need each one allowlisted. */
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={logoUrl}
        alt=""
        loading="lazy"
        className="size-10 shrink-0 rounded-lg border border-border object-contain"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface font-display text-[16px] font-semibold text-muted"
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
