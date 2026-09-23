"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Bookmark, Check, Share2, X } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { SparkIcon } from "@/components/ui/spark-icon";
import { useCompare } from "@/components/compare/compare-provider";
import { saveComparison } from "@/app/actions/collections";
import { compareHref } from "@/lib/compare/params";
import { GOALS, type CompareItemType } from "@/lib/compare/types";

/*
  Share, Save and Ask, for a comparison.

  SHARE hands over the canonical URL, built from the items and the goal rather
  than read off window.location, so any tracking parameters the page was reached
  with are not passed on. Every item in it is public by construction: the page
  only ever renders approved items, and the URL holds slugs, nothing else.

  SAVE creates a collection holding the items in column order (D113). Signed
  out, it is a link to the gate rather than a button that would refuse.

  ASK hands the comparison to Ask Celpare as a prefilled question through the
  ?q= seed /ask already reads. There is no second AI system and no new endpoint:
  the assistant, its gateway and its limits are exactly what /ask always uses
  (brief section 28).
*/

type Item = { type: CompareItemType; id: string; name: string };

export function CompareActions({ items, signedIn }: { items: Item[]; signedIn: boolean }) {
  const { refs, goal, view, track } = useCompare();
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  async function share() {
    const url = `${window.location.origin}${compareHref(refs, goal, view)}`;
    track({ event: "share_comparison" });
    try {
      if (navigator.share) {
        await navigator.share({ url, title: `Compare ${items.map((i) => i.name).join(", ")}` });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* A cancelled share sheet or a blocked clipboard. Neither is an error. */
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={share}>
        {copied ? <Check className="size-4" aria-hidden /> : <Share2 className="size-4" aria-hidden />}
        {copied ? "Link copied" : "Share"}
      </Button>

      {signedIn ? (
        <Button type="button" variant="outline" size="sm" onClick={() => setSaving(true)} aria-haspopup="dialog">
          <Bookmark className="size-4" aria-hidden />
          Save comparison
        </Button>
      ) : (
        <ButtonLink href="/get-started" variant="outline" size="sm">
          <Bookmark className="size-4" aria-hidden />
          Sign in to save
        </ButtonLink>
      )}

      <span aria-live="polite" className="sr-only">
        {copied ? "Link copied to the clipboard" : ""}
      </span>

      {signedIn ? (
        <SaveDialog
          key={items.map((i) => i.id).join(",")}
          open={saving}
          onClose={() => setSaving(false)}
          items={items}
        />
      ) : null}
    </div>
  );
}

function defaultName(items: Item[]): string {
  const name = items.map((i) => i.name).join(" vs ");
  return name.length <= 80 ? name : `${name.slice(0, 77)}...`;
}

function SaveDialog({ open, onClose, items }: { open: boolean; onClose: () => void; items: Item[] }) {
  const { track } = useCompare();
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(defaultName(items));
  const [isPublic, setIsPublic] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    start(async () => {
      const result = await saveComparison({
        name,
        isPublic,
        items: items.map((i) => ({ type: i.type, id: i.id })),
      });
      if (result.status === "ok") {
        track({ event: "save_comparison" });
        setDone(true);
      } else {
        setMessage(result.message);
      }
    });
  }

  function close() {
    setDone(false);
    setMessage("");
    onClose();
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="compare-save-title"
      onClose={close}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
      className="m-auto w-[min(420px,calc(100vw-2rem))] rounded-2xl border border-border bg-background p-0 text-foreground backdrop:bg-black/50"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2 id="compare-save-title" className="text-[16px] font-semibold">
          Save comparison
        </h2>
        <button
          type="button"
          onClick={close}
          className="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
        >
          <X className="size-[18px]" aria-hidden />
          <span className="sr-only">Close</span>
        </button>
      </div>

      {done ? (
        <div className="px-5 py-5" role="status">
          <p className="font-medium">Saved to your collections.</p>
          <p className="mt-1 text-[14px] text-muted">
            It holds these {items.length} in the order you compared them.
          </p>
          <div className="mt-4 flex gap-2">
            <ButtonLink href="/profile?tab=collections" size="sm">
              View collections
            </ButtonLink>
            <Button type="button" variant="outline" size="sm" onClick={close}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="px-5 py-5">
          <p className="text-[14px] text-muted">
            A saved comparison is a collection with these {items.length} in it, in this order.
          </p>
          <label className="mt-4 block text-[14px] font-medium" htmlFor="compare-save-name">
            Name
          </label>
          <input
            id="compare-save-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            required
            className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 text-[16px]"
          />
          <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 text-[14px]">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="size-4 accent-[var(--celpare-ink)]"
            />
            Show it on my profile
          </label>
          {message ? (
            <p className="mt-3 text-[14px]" role="alert">
              {message}
            </p>
          ) : null}
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving" : "Save"}
            </Button>
          </div>
        </form>
      )}
    </dialog>
  );
}

/*
  The question handed to Ask Celpare. Editable, which is also where "Custom"
  goals live: somebody comparing for a job the chips do not name writes it here.
  It is a starting sentence, never sent without them pressing the button.
*/
export function AskAboutComparison({ names }: { names: string[] }) {
  const { goal, track } = useCompare();
  const goalLabel = goal ? GOALS.find((g) => g.key === goal)?.label.toLowerCase() : null;
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
  const seed = `Compare ${list}${goalLabel ? ` for ${goalLabel}` : ""}. Which differences matter most, and why?`;

  const [question, setQuestion] = useState(seed);
  const [lastSeed, setLastSeed] = useState(seed);
  if (seed !== lastSeed) {
    setLastSeed(seed);
    setQuestion(seed);
  }

  /* Ready made questions, one tap to fill the box. Written from the names
     alone: they ask, they never assert an answer. */
  const first = names[0];
  const second = names[1] ?? names[0];
  const quick = [
    `Which of ${list} is best for coding?`,
    `Which of ${list} gives the most for the money?`,
    `When would I pick ${first} over ${second}?`,
  ];

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent">
          <SparkIcon className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-[17px] font-semibold">Ask Celpare about this comparison</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            Tell it what you need, and it explains which differences matter for you, with sources.
          </p>
        </div>
      </div>

      <ul className="mt-3 flex flex-wrap gap-1.5">
        {quick.map((q) => (
          <li key={q}>
            <button
              type="button"
              onClick={() => setQuestion(q)}
              className="inline-flex min-h-9 cursor-pointer items-center rounded-full border border-border bg-background px-3 text-start text-[13px] transition-colors duration-200 ease-out hover:border-foreground"
            >
              {q}
            </button>
          </li>
        ))}
      </ul>

      <label htmlFor="compare-ask" className="sr-only">
        Your question
      </label>
      <textarea
        id="compare-ask"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        rows={2}
        maxLength={500}
        className="mt-3 w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-[16px] leading-relaxed"
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[12px] text-muted">Opens in Ask Celpare. Nothing is sent until you press Ask.</p>
        <Link
          href={`/ask?q=${encodeURIComponent(question.trim().slice(0, 500))}`}
          onClick={() => track({ event: "ask_celpare_from_comparison" })}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-transparent bg-primary px-5 text-sm font-medium text-on-primary transition-colors duration-200 ease-out hover:bg-primary-hover"
        >
          Ask Celpare
        </Link>
      </div>
    </div>
  );
}
