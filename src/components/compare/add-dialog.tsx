"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OptionGroups, OptionRow } from "@/lib/compare/types";

/*
  Add to comparison.

  A NATIVE <dialog>, for the reasons save-to-collection.tsx gives: showModal()
  supplies the focus trap, Escape, the inert page behind it and the top layer,
  and m-auto is what centres it against Tailwind's preflight.

  THE LIST COMES FROM /api/compare/options, which runs Celpare Search for a typed
  query and the existing recent, saved and recommendation reads when the field is
  empty. Nothing is searched or ranked in the browser. Requests are debounced and
  the previous one is aborted, so a fast typist never sees an older answer land
  on top of a newer one.

  DUPLICATES CANNOT BE PICKED. A row already in the comparison is shown, marked
  Added and disabled, rather than hidden: hiding it would make somebody wonder
  whether the tool they are looking for exists.

  The field is 16px, per D91: iOS zooms the page into any smaller input and never
  zooms back out.
*/

const EMPTY: OptionGroups = {
  results: [],
  recent: [],
  saved: [],
  suggestedTools: [],
  suggestedModels: [],
  categories: [],
  degraded: false,
};

export function AddDialog({
  open,
  onClose,
  onPick,
  selected,
  full,
  type,
}: {
  type: "tool" | "model";
  open: boolean;
  onClose: () => void;
  onPick: (row: OptionRow) => void;
  /* "tool:slug" keys already in the comparison. */
  selected: Set<string>;
  full: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<{ slug: string; name: string } | null>(null);
  const [data, setData] = useState<OptionGroups>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      inputRef.current?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const term = q.trim();
    const params = new URLSearchParams({ type });
    if (term.length >= 2) params.set("q", term);
    else if (category) params.set("category", category.slug);

    const wait = term.length >= 2 ? 220 : 0;
    const timer = setTimeout(async () => {
      setLoading(true);
      setFailed(false);
      try {
        const res = await fetch(`/api/compare/options?${params.toString()}`, { signal: controller.signal });
        if (!res.ok) throw new Error(String(res.status));
        setData((await res.json()) as OptionGroups);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setFailed(true);
        setData(EMPTY);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, wait);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, category, open, type]);

  const searching = q.trim().length >= 2;

  function renderRow(row: OptionRow) {
    const key = `${row.type}:${row.slug}`;
    const added = selected.has(key);
    return (
      <li key={key}>
        <button
          type="button"
          disabled={added || full}
          onClick={() => onPick(row)}
          className={cn(
            "flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-start transition-colors duration-200 ease-out",
            "hover:bg-surface disabled:cursor-default disabled:hover:bg-transparent",
          )}
        >
          <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border p-1">
            {row.logoUrl ? (
              <Image src={row.logoUrl} alt="" width={36} height={36} className="size-full rounded-full object-contain" unoptimized />
            ) : (
              <span className="text-[13px] font-semibold text-muted" aria-hidden>
                {row.name.slice(0, 1).toUpperCase()}
              </span>
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-medium">{row.name}</span>
            <span className="block truncate text-[12px] text-muted">
              {row.type === "tool" ? "Tool" : "Model"}
              {row.sublabel ? `, ${row.sublabel}` : ""}
            </span>
          </span>
          {added ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-[12px] text-muted">
              <Check className="size-3.5" aria-hidden />
              Added
            </span>
          ) : null}
        </button>
      </li>
    );
  }

  function renderGroup(title: string, rows: OptionRow[]) {
    if (rows.length === 0) return null;
    return (
      <div key={title} className="mt-3 first:mt-0">
        <h3 className="px-3 pb-1 text-[12px] font-medium uppercase tracking-wide text-muted">{title}</h3>
        <ul>
          {rows.map(renderRow)}
        </ul>
      </div>
    );
  }

  const nothing =
    !loading &&
    !failed &&
    (searching || category) &&
    data.results.length === 0;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="compare-add-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
      className={cn(
        "m-auto w-[min(520px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-background p-0 text-foreground",
        "backdrop:bg-black/50",
        "max-h-[min(640px,calc(100dvh-4rem))]",
      )}
    >
      <div className="flex max-h-[min(640px,calc(100dvh-4rem))] flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 id="compare-add-title" className="text-[16px] font-semibold">
            {type === "model" ? "Add a model" : "Add a tool"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
          >
            <X className="size-[18px]" aria-hidden />
            <span className="sr-only">Close</span>
          </button>
        </div>

        <div className="border-b border-border px-5 py-3">
          <label className="relative block">
            <span className="sr-only">{type === "model" ? "Search models" : "Search tools"}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              ref={inputRef}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={type === "model" ? "Search models" : "Search tools"}
              autoComplete="off"
              className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-[16px] placeholder:text-muted"
            />
          </label>
          {full ? (
            <p className="mt-2 text-[13px] text-muted">
              This comparison is full. Remove one to add another.
            </p>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3" aria-live="polite">
          {category && !searching ? (
            <button
              type="button"
              onClick={() => setCategory(null)}
              className="mb-2 ml-3 inline-flex cursor-pointer items-center gap-1.5 text-[13px] text-muted transition-colors duration-200 ease-out hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              All suggestions
            </button>
          ) : null}

          {loading && data.results.length === 0 && data.recent.length === 0 && data.suggestedTools.length === 0 ? (
            <p className="px-3 py-4 text-[14px] text-muted" role="status">
              Loading
            </p>
          ) : failed ? (
            <p className="px-3 py-4 text-[14px]" role="status">
              The list could not be loaded. Check your connection and try typing again.
            </p>
          ) : nothing ? (
            <div className="px-3 py-4 text-[14px]">
              <p>{searching ? `Nothing in the catalogue matches "${q.trim()}".` : `No tools are listed in ${category?.name} yet.`}</p>
              <p className="mt-1 text-muted">Try a shorter name, or browse a category instead.</p>
            </div>
          ) : searching || category ? (
            renderGroup(searching ? "Results" : (category?.name ?? ""), data.results)
          ) : (
            <>
              {renderGroup("Recently viewed", data.recent)}
              {renderGroup("From your collections", data.saved)}
              {renderGroup("Suggested tools", data.suggestedTools)}
              {renderGroup("Suggested models", data.suggestedModels)}
              {data.categories.length > 0 ? (
                <div className="mt-4">
                  <h3 className="px-3 pb-2 text-[12px] font-medium uppercase tracking-wide text-muted">
                    Browse tools by category
                  </h3>
                  <ul className="flex flex-wrap gap-1.5 px-3">
                    {data.categories.map((c) => (
                      <li key={c.slug}>
                        <button
                          type="button"
                          onClick={() => setCategory(c)}
                          className="inline-flex min-h-9 cursor-pointer items-center rounded-full border border-border px-3 text-[13px] transition-colors duration-200 ease-out hover:bg-surface"
                        >
                          {c.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}

          {data.degraded && !failed ? (
            <p className="mt-3 px-3 text-[12px] text-muted">Part of this list could not be loaded, so it may be incomplete.</p>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
