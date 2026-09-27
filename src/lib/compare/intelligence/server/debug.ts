import "server-only";
import type { CompareRun } from "./engine";

/*
  The admin debug payload for /compare?debug=1 (guide 16 section 22). Built only
  after debugAllowed() said yes, and rendered only for that request. It holds the
  public record and the engine's working, never a viewer's identity or private
  state: there is nothing private in a comparison to leak.
*/

export type CompareDebug = {
  algorithm: string;
  strategy: string;
  setKey: string;
  cache: string;
  timings: { load: number; pipeline: number };
  entities: { id: string; type: string; name: string }[];
  unavailable: string[];
  dimensions: {
    id: string;
    label: string;
    section: string;
    kind: string;
    unit: string | null;
    direction: string;
    rank: number;
    coverage: string;
    cells: { state: string; display?: string; freshness?: string; evidence?: string[]; note?: string }[];
  }[];
  issues: { code: string; visibility: string; message: string }[];
  goal: { key: string; requirements: { dimension: string; importance: number; group: string }[] } | null;
  evidenceCount: number;
  evidenceBySource: Record<string, number>;
};

export function buildDebug(run: CompareRun): CompareDebug | null {
  const r = run.result;
  if (!r) return null;
  const rank = new Map(r.order.map((id, i) => [id, i + 1]));
  const bySource: Record<string, number> = {};
  for (const e of Object.values(r.evidence)) bySource[e.sourceType] = (bySource[e.sourceType] ?? 0) + 1;

  return {
    algorithm: r.algorithm,
    strategy: r.request.strategy,
    setKey: r.request.setKey,
    cache: run.cache,
    timings: run.timings,
    entities: r.matrix.entities.map((e) => ({ id: e.id, type: e.type, name: e.name })),
    unavailable: r.unavailable,
    dimensions: r.matrix.dimensions
      .map((d, i) => ({
        id: d.id,
        label: d.label,
        section: d.section,
        kind: d.kind,
        unit: d.unit,
        direction: d.direction,
        rank: rank.get(d.id) ?? 0,
        coverage: `${r.matrix.coverage[i]}/${r.matrix.entities.length}`,
        cells: r.matrix.values[i].map((v) =>
          v.state === "known"
            ? { state: v.state, display: v.display, freshness: v.freshness, evidence: v.evidence, note: v.note }
            : v.state === "conflict"
              ? { state: v.state, display: v.values.map((x) => x.display).join(" | "), evidence: v.values.map((x) => x.evidence) }
              : { state: v.state },
        ),
      }))
      .sort((a, b) => a.rank - b.rank),
    issues: r.issues.map((i) => ({ code: i.code, visibility: i.visibility, message: i.message })),
    goal: r.goal ? { key: r.goal.key, requirements: r.goal.requirements } : null,
    evidenceCount: Object.keys(r.evidence).length,
    evidenceBySource: bySource,
  };
}
