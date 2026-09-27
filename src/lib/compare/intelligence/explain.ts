import type { ResolvedGoal } from "./types";

/*
  The recommendation explanation (guide 16 section 19). A separate layer over fit
  that describes the PRIORITIES, never the products: it says what the stated goal
  or weights put weight on, and names no option. With no goal and no weights it
  returns null, because Celpare does not know what somebody values.
*/

function list(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

export function priorityLine(goal: ResolvedGoal | null): string | null {
  if (!goal || goal.requirements.length === 0) return null;
  const byGroup = new Map<string, number>();
  for (const r of goal.requirements) byGroup.set(r.group, Math.max(byGroup.get(r.group) ?? 0, r.importance));
  const groups = [...byGroup.entries()];
  const top = Math.max(...groups.map(([, i]) => i));
  const low = Math.min(...groups.map(([, i]) => i));
  const high = groups.filter(([, i]) => i === top).map(([g]) => g);
  const rest = groups.filter(([, i]) => i < top).map(([g]) => g);

  const lead = goal.key === "custom" ? "Your priorities" : `For ${goal.name.toLowerCase()}, your priorities`;
  if (high.length === 1 && rest.length === 0) return `${lead} put the weight on ${high[0]}.`;
  if (top === low || rest.length === 0) return `${lead} weigh ${list(high)} equally.`;
  return `${lead} put more weight on ${list(high)} than on ${list(rest)}.`;
}
