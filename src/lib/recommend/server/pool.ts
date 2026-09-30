import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";
import { createAnonClient } from "@/lib/supabase/server";
import { MODEL_ROW_COLUMNS, TOOL_ROW_COLUMNS, modelFromRow, toolFromRow } from "@/lib/search/rows";
import { penaltyOf, qualityOf } from "@/lib/search/ranking";
import type { EntityInput } from "../entity";

/*
  The catalogue, read for the engine (guide 17 section 2).

  ONE PARALLEL WAVE, then one service role wave for the bucketed signals and the
  co-occurrence pairs. Never a query per entry. Everything in the first wave is
  the public record, read with the anonymous client so RLS limits it to approved
  rows; the second wave returns counts only, never an identity (D152, D177).

  A failed read is reported, not hidden (D109): the engine returns a failure the
  page can state, rather than an empty list that looks like "nothing similar".
*/

export type CatalogueLoad = {
  inputs: EntityInput[];
  cooccurrence: { a: string; b: string; people: number; source: "co_compared" | "co_viewed" }[];
  failed: string[];
  ms: number;
};

type Row = Record<string, unknown>;

async function rows(label: string, failed: string[], q: PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>): Promise<Row[]> {
  try {
    const { data, error } = await q;
    if (error) {
      console.error(`[recommend] ${label} failed`, error.code, error.message);
      failed.push(label);
      return [];
    }
    return (data as Row[]) ?? [];
  } catch (err) {
    console.error(`[recommend] ${label} threw`, err);
    failed.push(label);
    return [];
  }
}

function admin(): SupabaseClient | null {
  return hasServiceRole() ? createAdminClient() : null;
}

export async function loadCatalogue(): Promise<CatalogueLoad> {
  const started = Date.now();
  const failed: string[] = [];
  const db = createAnonClient();

  const [toolRows, modelRows, factRows, planRows, evalRows] = await Promise.all([
    rows("tools", failed, db.from("tools").select(`${TOOL_ROW_COLUMNS}, canonical_domain, developer_id`).eq("status", "approved").limit(1000)),
    rows(
      "models",
      failed,
      db.from("models").select(`${MODEL_ROW_COLUMNS}, family, open_weights, lifecycle, max_output_tokens, output_modalities`).eq("status", "approved").limit(1000),
    ),
    rows("facts", failed, db.from("compare_facts").select("tool_id, model_id, attribute, value_flag, value_text, value_number, source_label").neq("attribute", "supported_parameters").limit(5000)),
    rows("plans", failed, db.from("tool_plans").select("tool_id, price_amount, billing_period").limit(5000)),
    rows("evaluations", failed, db.from("model_evaluations").select("model_id, verified_at").limit(5000)),
  ]);

  const factsBy = new Map<string, NonNullable<EntityInput["facts"]>>();
  for (const f of factRows) {
    const key = f.tool_id ? `tool:${f.tool_id}` : f.model_id ? `model:${f.model_id}` : null;
    if (!key) continue;
    const list = factsBy.get(key) ?? [];
    list.push({
      attribute: String(f.attribute),
      flag: (f.value_flag as boolean | null) ?? null,
      text: (f.value_text as string | null) ?? null,
      number: (f.value_number as number | null) ?? null,
      source: (f.source_label as string | null) ?? null,
    });
    factsBy.set(key, list);
  }

  /* The cheapest paid monthly plan per tool. Annual only plans are left out
     rather than divided, so a number shown as "/mo" is one somebody published. */
  const cheapest = new Map<string, number>();
  for (const p of planRows) {
    const amount = Number(p.price_amount);
    const period = String(p.billing_period ?? "month").toLowerCase();
    if (!(amount > 0) || !(period === "month" || period === "monthly")) continue;
    const id = String(p.tool_id);
    cheapest.set(id, Math.min(cheapest.get(id) ?? Infinity, amount));
  }

  const evals = new Map<string, { n: number; verified: number }>();
  for (const e of evalRows) {
    const id = String(e.model_id);
    const s = evals.get(id) ?? { n: 0, verified: 0 };
    s.n += 1;
    if (e.verified_at) s.verified += 1;
    evals.set(id, s);
  }

  const inputs: EntityInput[] = [];
  for (const r of toolRows) {
    const t = toolFromRow(r, "recommend");
    inputs.push({
      type: "tool",
      id: t.id,
      slug: t.slug,
      name: t.name,
      tagline: t.tagline,
      description: t.description,
      logoUrl: t.logoUrl,
      tags: t.tags,
      features: t.features,
      platforms: t.platforms,
      categories: t.categories,
      pricingModel: t.pricingModel,
      cheapestPlanUsd: cheapest.get(t.id) ?? null,
      developerId: (r.developer_id as string | null) ?? null,
      canonicalDomain: (r.canonical_domain as string | null) ?? null,
      facts: factsBy.get(`tool:${t.id}`) ?? [],
      listingQuality: qualityOf(t),
      listingPenalty: penaltyOf(t),
      rating: t.rating,
      ratingCount: t.ratingCount,
      verified: t.verified,
      status: "approved",
      createdAt: t.publishedAt ?? t.createdAt,
    });
  }
  for (const r of modelRows) {
    const m = modelFromRow(r, "recommend");
    const ev = evals.get(m.id);
    inputs.push({
      type: "model",
      id: m.id,
      slug: m.slug,
      name: m.name,
      description: m.description,
      tags: m.tags,
      provider: m.provider,
      family: (r.family as string | null) ?? null,
      contextWindow: m.contextWindow,
      maxOutput: (r.max_output_tokens as number | null) ?? null,
      inputPrice: m.inputPrice,
      outputPrice: m.outputPrice,
      modalities: m.modalities,
      outputModalities: (r.output_modalities as string[] | null) ?? [],
      openWeights: (r.open_weights as boolean | null) ?? null,
      lifecycle: (r.lifecycle as string | null) ?? null,
      evaluations: ev?.n ?? 0,
      verifiedEvaluations: ev?.verified ?? 0,
      facts: factsBy.get(`model:${m.id}`) ?? [],
      listingQuality: qualityOf(m),
      listingPenalty: penaltyOf(m),
      status: "approved",
      createdAt: m.createdAt,
    });
  }

  /* Wave 2, service role, counts only. */
  const svc = admin();
  const cooccurrence: CatalogueLoad["cooccurrence"] = [];
  if (svc && inputs.length) {
    const toolIds = inputs.filter((i) => i.type === "tool").map((i) => i.id);
    const modelIds = inputs.filter((i) => i.type === "model").map((i) => i.id);
    const [co, toolSignals, modelSignals] = await Promise.all([
      rows("co-occurrence", failed, svc.rpc("rec_item_cooccurrence", { p_ids: inputs.map((i) => i.id).slice(0, 500) })),
      toolIds.length ? rows("tool signals", failed, svc.rpc("explore_entity_signals", { p_type: "tool", p_ids: toolIds.slice(0, 500) })) : Promise.resolve([]),
      modelIds.length ? rows("model signals", failed, svc.rpc("explore_entity_signals", { p_type: "model", p_ids: modelIds.slice(0, 500) })) : Promise.resolve([]),
    ]);
    for (const p of co) {
      cooccurrence.push({
        a: `${p.a_type}:${p.a_id}`,
        b: `${p.b_type}:${p.b_id}`,
        people: Number(p.people) || 0,
        source: p.source === "co_compared" ? "co_compared" : "co_viewed",
      });
    }
    const signalsBy = new Map<string, EntityInput["signals"]>();
    for (const s of [...toolSignals, ...modelSignals]) {
      signalsBy.set(String(s.entity_id), {
        views7d: Number(s.views_7d) || 0,
        viewsPrev7d: Number(s.views_prev7d) || 0,
        saves7d: Number(s.saves_7d) || 0,
        compareAdds7d: Number(s.compare_adds_7d) || 0,
      });
    }
    for (const i of inputs) i.signals = signalsBy.get(i.id);
  }

  return { inputs, cooccurrence, failed, ms: Date.now() - started };
}
