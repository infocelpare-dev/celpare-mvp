"use client";

import { useState } from "react";
import { useCompare } from "@/components/compare/compare-provider";
import { cn } from "@/lib/utils";
import { WEIGHT_KEYS, formatScenario, formatWeights, parseWeights } from "@/lib/compare/intelligence/request";
import type { PreferenceWeights, UsageScenario, WeightKey } from "@/lib/compare/intelligence/types";

/*
  The two controls compare_v1 adds to the builder (4BJ, D165, D169).

  BOTH WRITE THE URL, and only on Apply. The comparison is the URL (D114), so a
  shared link shows the same fit and the same estimate; applying once rather than
  on every tap keeps it to one navigation and one history entry. ui-ux-pro-max:
  every input has a visible label, and numeric fields use inputmode numeric.

  Weights are labelled radio groups, 0 to 5, rather than sliders: each value is a
  real, keyboard reachable choice with its own name, and "Not set" is distinct
  from 0 (0 removes a group, not set leaves the goal's own emphasis).
*/

const LABELS: Record<WeightKey, { name: string; hint: string }> = {
  price: { name: "Price", hint: "Listed plan and token prices" },
  quality: { name: "Measured quality", hint: "Benchmark results" },
  speed: { name: "Speed", hint: "Measured latency and output speed" },
  privacy: { name: "Privacy", hint: "Self hosting, private deployment, controls" },
  context: { name: "Context", hint: "Context window and maximum output" },
};

export function PreferencesPanel() {
  const { weights, setPreferences, track, pending } = useCompare();
  const current = parseWeights(weights) ?? {};
  const [draft, setDraft] = useState<PreferenceWeights>(current);
  const [open, setOpen] = useState(Boolean(weights));

  function apply() {
    for (const k of WEIGHT_KEYS) {
      if (draft[k] !== current[k] && typeof draft[k] === "number") {
        track({ event: "preference_changed", section: k, position: draft[k] });
      }
    }
    setPreferences({ weights: formatWeights(draft) });
  }

  function clear() {
    setDraft({});
    track({ event: "preference_changed", section: "cleared" });
    setPreferences({ weights: null });
  }

  return (
    <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} className="mt-4 rounded-2xl border border-border">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-[14px] font-medium [&::-webkit-details-marker]:hidden">
        Adjust your priorities
        <span className="text-[13px] font-normal text-muted">{weights ? "Set" : "Optional"}</span>
      </summary>
      <div className="border-t border-border px-4 pb-4 pt-3">
        <p className="text-[13px] leading-relaxed text-muted">
          These change only how the fit section reads the data. They never change a fact, a price or the order of the columns, and they are kept in the link, not saved to your account.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {WEIGHT_KEYS.map((k) => (
            <fieldset key={k}>
              <legend className="text-[14px] font-medium">{LABELS[k].name}</legend>
              <p className="text-[12px] text-muted">{LABELS[k].hint}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {[null, 0, 1, 2, 3, 4, 5].map((v) => {
                  const on = (draft[k] ?? null) === v;
                  return (
                    <label
                      key={String(v)}
                      className={cn(
                        "inline-flex min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-full border px-2.5 text-[13px] transition-colors duration-200 ease-out has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-foreground",
                        on ? "border-transparent bg-accent text-on-accent" : "border-border hover:bg-surface",
                      )}
                    >
                      <input
                        type="radio"
                        name={`w-${k}`}
                        className="sr-only"
                        checked={on}
                        onChange={() =>
                          setDraft((d) => {
                            const next = { ...d };
                            if (v === null) delete next[k];
                            else next[k] = v;
                            return next;
                          })
                        }
                      />
                      {v === null ? "Not set" : v}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={apply}
            disabled={pending}
            className="inline-flex h-9 cursor-pointer items-center rounded-full bg-primary px-4 text-[14px] font-medium text-on-primary transition-colors duration-200 ease-out hover:bg-primary-hover disabled:opacity-60"
          >
            Apply priorities
          </button>
          {weights ? (
            <button
              type="button"
              onClick={clear}
              disabled={pending}
              className="inline-flex h-9 cursor-pointer items-center rounded-full border border-border px-4 text-[14px] transition-colors duration-200 ease-out hover:bg-surface"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>
    </details>
  );
}

export function ScenarioForm({ initial }: { initial: UsageScenario | null }) {
  const { setPreferences, track, pending } = useCompare();
  const [input, setInput] = useState(initial ? String(initial.inputTokens) : "");
  const [output, setOutput] = useState(initial ? String(initial.outputTokens) : "");
  const [error, setError] = useState("");

  function apply(e: React.FormEvent) {
    e.preventDefault();
    const i = Number(input.replace(/[,\s_]/g, "") || "0");
    const o = Number(output.replace(/[,\s_]/g, "") || "0");
    if (!Number.isInteger(i) || !Number.isInteger(o) || i < 0 || o < 0 || i > 1_000_000_000 || o > 1_000_000_000) {
      setError("Enter whole numbers of tokens, up to one billion each.");
      return;
    }
    if (i === 0 && o === 0) {
      setError("Enter at least one of input or output tokens.");
      return;
    }
    setError("");
    track({ event: "scenario_changed", section: "scenario" });
    setPreferences({ scenario: formatScenario({ inputTokens: i, outputTokens: o }) });
  }

  return (
    <form onSubmit={apply} className="flex flex-wrap items-end gap-3" noValidate>
      <label className="flex flex-col gap-1 text-[13px] font-medium">
        Input tokens
        <input
          inputMode="numeric"
          autoComplete="off"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="1000000"
          className="h-10 w-40 rounded-xl border border-border bg-background px-3 text-[16px] font-normal sm:text-[15px]"
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px] font-medium">
        Output tokens
        <input
          inputMode="numeric"
          autoComplete="off"
          value={output}
          onChange={(e) => setOutput(e.target.value)}
          placeholder="250000"
          className="h-10 w-40 rounded-xl border border-border bg-background px-3 text-[16px] font-normal sm:text-[15px]"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 cursor-pointer items-center rounded-full bg-primary px-4 text-[14px] font-medium text-on-primary transition-colors duration-200 ease-out hover:bg-primary-hover disabled:opacity-60"
      >
        Estimate
      </button>
      {initial ? (
        <button
          type="button"
          onClick={() => setPreferences({ scenario: null })}
          disabled={pending}
          className="inline-flex h-10 cursor-pointer items-center rounded-full border border-border px-4 text-[14px] transition-colors duration-200 ease-out hover:bg-surface"
        >
          Clear
        </button>
      ) : null}
      <p className="w-full text-[13px] text-muted" role="status" aria-live="polite">
        {error}
      </p>
    </form>
  );
}
