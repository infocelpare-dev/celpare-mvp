"use client";

import { useActionState, useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { reviewTool, deleteReview, type ToolState } from "@/app/actions/tool";
import type { ToolReview } from "@/lib/tools/queries";

/*
  Ratings and reviews.

  Every number on this screen is computed from real rows by
  tg_tool_rating_rollup. Nothing is seeded, nothing is rounded up to look
  healthier, and an unrated tool says so rather than showing a zero that reads
  as a bad score. D13 and D30.

  One review per person is a unique constraint, so the form below is an upsert:
  writing again replaces what you said rather than adding a second opinion.
*/

const IDLE: ToolState = { status: "idle", message: "" };

export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          style={{ width: size, height: size }}
          className={cn(
            "shrink-0",
            n <= Math.round(value) ? "fill-accent text-accent" : "text-border",
          )}
        />
      ))}
    </span>
  );
}

export function RatingSummary({
  rating,
  count,
  breakdown,
}: {
  rating: number | null;
  count: number;
  breakdown: Record<1 | 2 | 3 | 4 | 5, number>;
}) {
  if (count === 0 || rating == null) {
    return (
      <div className="rounded-2xl border border-border p-5">
        <p className="font-display text-[17px] font-semibold">Not rated yet</p>
        <p className="mt-1.5 max-w-[46ch] text-[14px] leading-relaxed text-muted">
          Nobody has rated this tool. When somebody does, the score here is the
          average of what real people gave it, and nothing else.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border p-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="font-display text-[34px] font-semibold leading-none tabular-nums">
          {rating.toFixed(1)}
        </span>
        <div>
          <Stars value={rating} size={18} />
          <p className="mt-1 text-[13px] text-muted">
            {count} {count === 1 ? "rating" : "ratings"}
          </p>
        </div>
      </div>

      <ul className="mt-4 space-y-1.5">
        {([5, 4, 3, 2, 1] as const).map((n) => {
          const value = breakdown[n];
          const pct = count > 0 ? Math.round((value / count) * 100) : 0;
          return (
            <li key={n} className="flex items-center gap-3 text-[13px]">
              <span className="w-3 shrink-0 tabular-nums text-muted">{n}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
                <span
                  className="block h-full rounded-full bg-accent"
                  style={{ width: `${pct}%` }}
                />
              </span>
              <span className="w-8 shrink-0 text-right tabular-nums text-muted">
                {value}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function when(iso: string): string {
  /* Pinned to UTC. Without it the server and the browser can format in
     different zones and React reports a hydration error, which happened for
     real on /admin/security. */
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function StarPicker({ name, defaultValue }: { name: string; defaultValue: number }) {
  const [value, setValue] = useState(defaultValue);

  return (
    <fieldset>
      <legend className="text-[14px] font-medium">Your rating</legend>
      {/* Radios, not buttons: a rating is a single choice out of five, which is
          exactly what a radio group is, and it arrives in the keyboard and the
          screen reader already working. */}
      <div className="mt-2 flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <label
            key={n}
            className="cursor-pointer p-1"
            title={`${n} out of 5`}
          >
            <input
              type="radio"
              name={name}
              value={n}
              checked={value === n}
              onChange={() => setValue(n)}
              className="sr-only peer"
            />
            <Star
              className={cn(
                "size-7 transition-colors duration-150 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent",
                n <= value ? "fill-accent text-accent" : "text-border",
              )}
            />
            <span className="sr-only">{n} out of 5</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ReviewComposer({
  toolId,
  slug,
  signedIn,
  mine,
}: {
  toolId: string;
  slug: string;
  signedIn: boolean;
  mine: { id: string; rating: number; body: string | null } | null;
}) {
  const [state, action, pending] = useActionState(reviewTool, IDLE);
  const [removeState, remove, removing] = useActionState(deleteReview, IDLE);

  if (!signedIn) {
    return (
      <div className="rounded-2xl border border-border p-5">
        <p className="text-[14px] leading-relaxed text-muted">
          <a href="/get-started" className="underline underline-offset-2">
            Sign in
          </a>{" "}
          to rate this tool. One rating per person, and you can change yours
          later.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="rounded-2xl border border-border p-5">
      <input type="hidden" name="toolId" value={toolId} />
      <input type="hidden" name="slug" value={slug} />

      <p className="font-display text-[17px] font-semibold">
        {mine ? "Your review" : "Rate this tool"}
      </p>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        {mine
          ? "Writing again replaces what you said. It is one opinion changing its mind, not two."
          : "One rating per person. You can change it later."}
      </p>

      <div className="mt-4">
        <StarPicker name="rating" defaultValue={mine?.rating ?? 0} />
      </div>

      <label htmlFor="review-body" className="mt-4 block text-[14px] font-medium">
        Your review <span className="font-normal text-muted">(optional)</span>
      </label>
      <textarea
        id="review-body"
        name="body"
        rows={4}
        maxLength={2000}
        defaultValue={mine?.body ?? ""}
        placeholder="What did you use it for, and how did it go?"
        className="mt-1.5 w-full resize-y rounded-xl border border-border bg-background px-4 py-3 text-[16px] placeholder:text-muted sm:text-[15px]"
      />

      {state.message ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className="mt-3 text-[13px]"
        >
          {state.message}
        </p>
      ) : null}
      {removeState.message ? (
        <p role="status" className="mt-3 text-[13px]">
          {removeState.message}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving" : mine ? "Update review" : "Post review"}
        </Button>

        {mine ? (
          <button
            type="submit"
            formAction={remove}
            disabled={removing}
            className="cursor-pointer text-[13px] text-muted underline underline-offset-4 hover:text-foreground disabled:opacity-50"
          >
            {removing ? "Removing" : "Remove my review"}
          </button>
        ) : null}
        {mine ? <input type="hidden" name="reviewId" value={mine.id} /> : null}
      </div>
    </form>
  );
}

export function ReviewList({ reviews, viewerId }: { reviews: ToolReview[]; viewerId: string | null }) {
  if (reviews.length === 0) {
    return (
      <div className="rounded-2xl border border-border px-6 py-10 text-center">
        <p className="font-display text-[16px] font-semibold">No reviews yet</p>
        <p className="mx-auto mt-2 max-w-[42ch] text-[14px] leading-relaxed text-muted">
          Be the first to say what this is actually like to use.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {reviews.map((r) => {
        const name = r.author?.full_name || r.author?.username || "Someone";
        return (
          <li key={r.id} className="rounded-2xl border border-border p-5">
            <div className="flex items-start gap-3">
              {r.author?.avatar_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={r.author.avatar_url}
                  alt=""
                  loading="lazy"
                  className="size-9 shrink-0 rounded-full border border-border object-cover"
                />
              ) : (
                <span
                  aria-hidden
                  className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface font-display text-[14px] font-semibold text-muted"
                >
                  {name.trim().charAt(0).toUpperCase()}
                </span>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {r.author?.username ? (
                    <a
                      href={`/u/${r.author.username}`}
                      className="text-[14px] font-medium underline-offset-4 hover:underline"
                    >
                      {name}
                    </a>
                  ) : (
                    <span className="text-[14px] font-medium">{name}</span>
                  )}
                  {r.user_id === viewerId ? (
                    <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
                      You
                    </span>
                  ) : null}
                  <span className="text-[13px] text-muted">{when(r.created_at)}</span>
                </div>

                <div className="mt-1.5">
                  <Stars value={r.rating} />
                  <span className="sr-only">{r.rating} out of 5</span>
                </div>

                {r.body ? (
                  <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed">
                    {r.body}
                  </p>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
