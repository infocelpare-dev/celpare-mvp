"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Chip, ChipGroup } from "@/components/onboarding/chips";
import { ToolPicker } from "@/components/onboarding/onboarding-flow";
import { saveOnboarding, type OnboardingInput } from "@/app/actions/onboarding";
import { GOALS, ROLES } from "@/lib/onboarding/options";
import type { Option, ToolOption } from "@/lib/onboarding/server";

export type InterestValues = {
  role: string | null;
  goals: string[];
  categoryIds: string[];
  topicIds: string[];
  toolIds: string[];
};

/*
  The sign up answers, editable any time (phase ONB). One Save for the lot,
  through the same action and checks as onboarding itself.
*/
export function InterestsForm({
  options,
  values,
}: {
  options: { categories: Option[]; topics: Option[]; tools: ToolOption[] };
  values: InterestValues;
}) {
  const [v, setV] = useState<InterestValues>(values);
  const [status, setStatus] = useState("");
  const [pending, start] = useTransition();

  const toggle = (key: "goals" | "categoryIds" | "topicIds" | "toolIds", id: string) =>
    setV((s) => ({ ...s, [key]: s[key].includes(id) ? s[key].filter((x) => x !== id) : [...s[key], id] }));

  function save() {
    setStatus("");
    start(async () => {
      const r = await saveOnboarding({
        role: v.role as OnboardingInput["role"],
        goals: v.goals as OnboardingInput["goals"],
        categoryIds: v.categoryIds,
        topicIds: v.topicIds,
        toolIds: v.toolIds,
      });
      setStatus(r.ok ? "Saved." : r.message);
    });
  }

  return (
    <div className="mt-6 space-y-8">
      <Group title="What best describes you">
        <ChipGroup label="What best describes you">
          {ROLES.map((r) => (
            <Chip key={r.key} selected={v.role === r.key} onToggle={() => setV((s) => ({ ...s, role: s.role === r.key ? null : r.key }))}>
              {r.label}
            </Chip>
          ))}
        </ChipGroup>
      </Group>

      <Group title="What you want to do">
        <ChipGroup label="What you want to do">
          {GOALS.map((g) => (
            <Chip key={g.key} selected={v.goals.includes(g.key)} onToggle={() => toggle("goals", g.key)}>
              {g.label}
            </Chip>
          ))}
        </ChipGroup>
      </Group>

      <Group title="AI tools and models for">
        <ChipGroup label="Categories">
          {options.categories.map((c) => (
            <Chip key={c.id} selected={v.categoryIds.includes(c.id)} onToggle={() => toggle("categoryIds", c.id)}>
              {c.name}
            </Chip>
          ))}
        </ChipGroup>
      </Group>

      <Group title="Community topics">
        <ChipGroup label="Topics">
          {options.topics.map((t) => (
            <Chip key={t.id} selected={v.topicIds.includes(t.id)} onToggle={() => toggle("topicIds", t.id)}>
              {t.name}
            </Chip>
          ))}
        </ChipGroup>
      </Group>

      <Group title="AI tools you already use">
        <ToolPicker tools={options.tools} categoryIds={v.categoryIds} selected={v.toolIds} onToggle={(id) => toggle("toolIds", id)} />
      </Group>

      <div className="flex items-center gap-3">
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? "Saving" : "Save interests"}
        </Button>
        <span role="status" aria-atomic="true" className="text-[13px] text-muted">{status}</span>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-[14px] font-medium text-muted">{title}</h3>
      {children}
    </section>
  );
}
