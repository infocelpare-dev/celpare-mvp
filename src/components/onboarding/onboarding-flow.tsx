"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { VerifiedTick } from "@/components/ui/verified-tick";
import { FollowButton } from "@/components/profile/follow-button";
import { Chip, ChipGroup } from "@/components/onboarding/chips";
import { finishOnboarding, saveOnboarding, suggestFollows, type OnboardingInput } from "@/app/actions/onboarding";
import { GOALS, HEARD_FROM, LIMITS, ROLES, STEPS, type StepKey } from "@/lib/onboarding/options";
import type { Option, Suggestion, ToolOption } from "@/lib/onboarding/server";
import { cn } from "@/lib/utils";

type Answers = {
  role: string | null;
  goals: string[];
  categoryIds: string[];
  topicIds: string[];
  toolIds: string[];
  heardFrom: string | null;
  heardOther: string;
};

const COPY: Record<StepKey, { title: string; hint: string }> = {
  role: { title: "What best describes you?", hint: "Tap the one that fits most of the time." },
  goals: { title: "What do you want to do on Celpare?", hint: "Pick as many as you like." },
  interests: { title: "What are you interested in?", hint: `Pick ${LIMITS.SUGGESTED_INTERESTS} or more and your feed starts with them.` },
  tools: { title: "Which AI tools do you already use?", hint: "We will suggest what goes well with them, not what you already have." },
  heard: { title: "Where did you hear about Celpare?", hint: "Tap one. It helps us reach more people like you." },
  people: { title: "People you might like", hint: "They post about what you picked. Follow anyone you want." },
};

/* Tools shown before a search or Show all. */
const TOOLS_FIRST = 24;

export function OnboardingFlow({
  options,
  initial,
  startAt = 0,
}: {
  options: { categories: Option[]; topics: Option[]; tools: ToolOption[] };
  initial: Answers;
  /* The step to open on, 0 based. */
  startAt?: number;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(Math.min(Math.max(0, startAt), STEPS.length - 1));
  const [a, setA] = useState<Answers>(initial);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [people, setPeople] = useState<Suggestion[] | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const step = STEPS[index]!;
  const last = index === STEPS.length - 1;

  /* Focus the question on each step so keyboard and screen reader users start there. */
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [index]);

  /* Opened straight on the last step (resuming): fetch its people once. */
  useEffect(() => {
    if (STEPS[startAt] !== "people") return;
    suggestFollows(initial.topicIds).then(setPeople, () => setPeople([]));
  }, [startAt, initial.topicIds]);

  function payload(s: StepKey): OnboardingInput {
    switch (s) {
      case "role": return { role: a.role as OnboardingInput["role"] };
      case "goals": return { goals: a.goals as OnboardingInput["goals"] };
      case "interests": return { categoryIds: a.categoryIds, topicIds: a.topicIds };
      case "tools": return { toolIds: a.toolIds };
      case "heard": return { heardFrom: a.heardFrom as OnboardingInput["heardFrom"], heardOther: a.heardOther };
      case "people": return {};
    }
  }

  function done() {
    start(async () => {
      const r = await finishOnboarding();
      if (!r.ok) return setError(r.message);
      router.replace("/community");
    });
  }

  /* `answer` is passed by a single choice tap, which moves on before state has caught up. */
  function next(skip: boolean, answer?: OnboardingInput) {
    setError("");
    /* The last step's people come from the topics picked; ask as we head there. */
    if (STEPS[index + 1] === "people") {
      setPeople(null);
      suggestFollows(a.topicIds).then(setPeople, () => setPeople([]));
    }
    start(async () => {
      const r = await saveOnboarding(skip ? { skipped: step } : answer ?? payload(step));
      if (!r.ok) return setError(r.message);
      setIndex((i) => i + 1);
    });
  }

  /*
    Single choice questions move on as soon as one is tapped (founder
    2026-10-31), no Continue needed. "Somewhere else" waits for the typed answer.
  */
  function pickRole(key: string) {
    if (pending) return;
    setA((s) => ({ ...s, role: key }));
    next(false, { role: key as OnboardingInput["role"] });
  }

  function pickHeard(key: string) {
    if (pending) return;
    setA((s) => ({ ...s, heardFrom: key }));
    if (key !== "other") next(false, { heardFrom: key as OnboardingInput["heardFrom"] });
  }

  const answered =
    step === "role" ? a.role !== null
    : step === "goals" ? a.goals.length > 0
    : step === "interests" ? a.categoryIds.length + a.topicIds.length > 0
    : step === "tools" ? a.toolIds.length > 0
    : step === "heard" ? a.heardFrom !== null && (a.heardFrom !== "other" || a.heardOther.trim().length > 0)
    : true;

  const toggle = (key: "goals" | "categoryIds" | "topicIds" | "toolIds", id: string) =>
    setA((s) => ({ ...s, [key]: s[key].includes(id) ? s[key].filter((x) => x !== id) : [...s[key], id] }));

  return (
    <div>
      <p className="text-[14px] text-muted" aria-live="polite">
        Step {index + 1} of {STEPS.length}
      </p>
      <div
        className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface"
        role="progressbar"
        aria-label="Progress"
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
        aria-valuenow={index + 1}
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${((index + 1) / STEPS.length) * 100}%` }}
        />
      </div>

      <h1
        ref={headingRef}
        tabIndex={-1}
        className="focus-ring-none mt-8 font-display text-[28px] font-medium leading-tight tracking-[-0.02em] [text-wrap:balance] sm:text-[34px]"
      >
        {index === 0 ? "Welcome to Celpare. " : ""}
        {COPY[step].title}
      </h1>
      <p className="mt-2 text-[15px] text-muted">{COPY[step].hint}</p>

      <div className="mt-8">
        {step === "role" ? (
          <ChipGroup label={COPY.role.title}>
            {ROLES.map((r) => (
              <Chip key={r.key} selected={a.role === r.key} onToggle={() => pickRole(r.key)}>
                {r.label}
              </Chip>
            ))}
          </ChipGroup>
        ) : null}

        {step === "goals" ? (
          <ChipGroup label={COPY.goals.title}>
            {GOALS.map((g) => (
              <Chip key={g.key} selected={a.goals.includes(g.key)} onToggle={() => toggle("goals", g.key)}>
                {g.label}
              </Chip>
            ))}
          </ChipGroup>
        ) : null}

        {step === "interests" ? (
          <div className="space-y-7">
            <section>
              <h2 className="mb-3 text-[14px] font-medium text-muted">AI tools and models for</h2>
              <ChipGroup label="Categories">
                {options.categories.map((c) => (
                  <Chip key={c.id} selected={a.categoryIds.includes(c.id)} onToggle={() => toggle("categoryIds", c.id)}
                    disabled={a.categoryIds.length >= LIMITS.CATEGORIES}>
                    {c.name}
                  </Chip>
                ))}
              </ChipGroup>
            </section>
            <section>
              <h2 className="mb-3 text-[14px] font-medium text-muted">Community topics</h2>
              <ChipGroup label="Topics">
                {options.topics.map((t) => (
                  <Chip key={t.id} selected={a.topicIds.includes(t.id)} onToggle={() => toggle("topicIds", t.id)}
                    disabled={a.topicIds.length >= LIMITS.TOPICS}>
                    {t.name}
                  </Chip>
                ))}
              </ChipGroup>
            </section>
          </div>
        ) : null}

        {step === "tools" ? (
          <ToolPicker tools={options.tools} categoryIds={a.categoryIds} selected={a.toolIds} onToggle={(id) => toggle("toolIds", id)} />
        ) : null}

        {step === "heard" ? (
          <div>
            <ChipGroup label={COPY.heard.title}>
              {HEARD_FROM.map((h) => (
                <Chip key={h.key} selected={a.heardFrom === h.key}
                  onToggle={() => pickHeard(h.key)}>
                  {h.label}
                </Chip>
              ))}
            </ChipGroup>
            {a.heardFrom === "other" ? (
              <div className="mt-5 max-w-[400px]">
                <label htmlFor="heard-other" className="mb-1.5 block text-[14px] font-medium">Where?</label>
                <input
                  id="heard-other"
                  value={a.heardOther}
                  maxLength={LIMITS.HEARD_OTHER}
                  onChange={(e) => setA((s) => ({ ...s, heardOther: e.target.value }))}
                  placeholder="A podcast, an event, a website..."
                  className="h-11 w-full rounded-xl border border-border bg-background px-4 text-[16px] text-foreground placeholder:text-muted sm:text-[15px]"
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {step === "people" ? <PeopleStep people={people} /> : null}
      </div>

      {error ? (
        <p role="alert" className="mt-6 text-[14px] text-danger-text">{error}</p>
      ) : null}

      <div className="mt-10 flex items-center justify-between gap-3 border-t border-border pt-6">
        <Button
          variant="ghost"
          onClick={() => { setError(""); setIndex((i) => Math.max(0, i - 1)); }}
          disabled={index === 0 || pending}
          className={cn(index === 0 && "invisible")}
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back
        </Button>
        <div className="flex items-center gap-2">
          {!last ? (
            <Button variant="outline" onClick={() => next(true)} disabled={pending}>
              Skip
            </Button>
          ) : null}
          <Button onClick={() => (last ? done() : next(!answered))} disabled={pending}>
            {last ? "Go to Celpare" : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ToolPicker({
  tools,
  categoryIds,
  selected,
  onToggle,
}: {
  tools: ToolOption[];
  categoryIds: string[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [all, setAll] = useState(false);

  /* Tools in the categories picked a step ago come first, then the rest by name. */
  const ordered = useMemo(() => {
    const picked = new Set(categoryIds);
    const match = (t: ToolOption) => t.categoryIds.some((c) => picked.has(c));
    return [...tools].sort((x, y) => Number(match(y)) - Number(match(x)) || x.name.localeCompare(y.name));
  }, [tools, categoryIds]);

  const term = q.trim().toLowerCase();
  const filtered = term ? ordered.filter((t) => t.name.toLowerCase().includes(term)) : ordered;
  const shown = term || all ? filtered : filtered.slice(0, TOOLS_FIRST);
  const full = selected.length >= LIMITS.TOOLS;

  return (
    <div>
      <div className="relative max-w-[400px]">
        <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <label htmlFor="tool-search" className="sr-only">Search tools</label>
        <input
          id="tool-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search tools"
          className="h-11 w-full rounded-full border border-border bg-background pl-10 pr-4 text-[16px] text-foreground placeholder:text-muted sm:text-[15px]"
        />
      </div>
      <p className="mt-3 text-[13px] text-muted" aria-live="polite">
        {selected.length > 0 ? `${selected.length} selected` : "None selected yet"}
      </p>

      <div role="group" aria-label="AI tools" className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {shown.map((t) => {
          const on = selected.includes(t.id);
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={on}
              disabled={full && !on}
              onClick={() => onToggle(t.id)}
              className={cn(
                "flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors duration-200 ease-out disabled:cursor-not-allowed disabled:opacity-40",
                on ? "border-foreground bg-surface" : "border-border bg-elevated hover:bg-surface",
              )}
            >
              <ToolLogo name={t.name} logoUrl={t.logoUrl} />
              <span className="flex min-w-0 items-center gap-1 text-[14px] font-medium">
                <span className="truncate">{t.name}</span>
                {t.verified ? <VerifiedTick className="size-3.5 shrink-0" /> : null}
              </span>
              {on ? <span aria-hidden className="ml-auto size-2.5 shrink-0 rounded-full bg-accent ring-1 ring-foreground/20" /> : null}
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? <p className="mt-4 text-[14px] text-muted">No tool by that name yet.</p> : null}

      {!term && !all && filtered.length > TOOLS_FIRST ? (
        <Button variant="outline" size="sm" className="mt-4" onClick={() => setAll(true)}>
          Show all {filtered.length} tools
        </Button>
      ) : null}
    </div>
  );
}

function ToolLogo({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  if (logoUrl) {
    /* A plain img: third party hosts, the precedent in ask/tool-cards.tsx. */
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img src={logoUrl} alt="" loading="lazy" className="size-8 shrink-0 rounded-lg border border-border bg-background object-contain" />
    );
  }
  return (
    <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface font-display text-[14px] font-semibold text-muted">
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

function PeopleStep({ people }: { people: Suggestion[] | null }) {
  if (people === null) {
    return (
      <ul aria-busy className="space-y-3">
        {[0, 1, 2].map((i) => (
          <li key={i} className="h-16 animate-pulse rounded-2xl bg-surface motion-reduce:animate-none" />
        ))}
      </ul>
    );
  }
  if (people.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-elevated p-5 text-[15px] text-muted">
        Nobody to suggest yet for what you picked. Your feed will show the best posts while people join.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border rounded-2xl border border-border bg-elevated">
      {people.map((p) => (
        <li key={p.id} className="flex items-center gap-3 px-4 py-3">
          <Avatar fullName={p.fullName} username={p.username} avatarUrl={p.avatarUrl} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-medium">{p.fullName || p.username}</p>
            <p className="truncate text-[13px] text-muted">
              @{p.username}
              {p.matches > 0 ? ` · ${p.matches} ${p.matches === 1 ? "post" : "posts"} on your topics` : ""}
            </p>
          </div>
          <FollowButton targetId={p.id} username={p.username} initialFollowing={false} signedIn />
        </li>
      ))}
    </ul>
  );
}
