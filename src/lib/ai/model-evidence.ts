import { createAnonClient, isSupabaseConfigured } from "@/lib/supabase/server";

/*
  Model evidence for Ask Celpare: what benchmarks measure, and the recorded
  results on them.

  THIS IS HOW ASK "LEARNS" THE BENCHMARKS. Not by retraining a model, which would
  freeze whatever it was taught on the day and could not cite anything, but by
  reading the benchmark catalogue and the recorded results at the moment it
  answers. Add a benchmark or a result to the database and the next answer knows
  it, with its source. Compare reads the same two tables, so the page and the
  assistant can never explain a benchmark differently.

  WHAT THE MODEL SEES IS AN ALLOWLIST (D39). Results come through
  model_evidence_for_ai, whose return type is the whole list of columns: names,
  scores, notes, who measured it, where it was published. No ids and no listing
  URLs. The benchmark rows are public descriptive text.

  WHEN IT RUNS. Only for questions about models or benchmarks, detected here from
  the words used. It is two small reads against public data, so it costs nothing
  like a web search does, and it is skipped for everything else.
*/

type Goal = "coding" | "research" | "writing" | "image" | "business" | "agents" | "api";

/* Which words point at which job. Deliberately plain: a person asking "best
   model for programming" and one asking "which LLM codes best" mean the same. */
const GOAL_WORDS: Record<Goal, RegExp> = {
  coding: /\b(cod(e|es|ing|er)|program(ming|mer)?|developer|software|debug\w*|refactor\w*|terminal|repo(sitory)?|pull request|swe)\b/i,
  agents: /\b(agent(s|ic)?|computer use|automat\w+|workflow\w*|operate|click)\b/i,
  business: /\b(business|office|knowledge work|spreadsheet|professional|enterprise|company)\b/i,
  research: /\b(research|scien\w+|reason\w*|math\w*|exam|phd|academic)\b/i,
  writing: /\b(writ(e|ing)|essay|copy|document)\b/i,
  image: /\b(chart|graph|visual|vision|image|figure|diagram)\b/i,
  api: /\b(api|sdk|integrat\w+)\b/i,
};

const MODEL_WORDS =
  /\b(models?|llms?|benchmarks?|bench|evals?|scores?|leaderboard|opus|sonnet|fable|haiku|claude|gpt|gemini|grok|deepseek|llama|mistral|qwen|kimi|glm)\b/i;

/* A question that names tools rather than models. "Which model is good for
   coding" is about models; "which tool for coding" is about products. */
const TOOL_WORDS = /\b(tools?|apps?|software to use|editor|ide|plugin|extension|platform)\b/i;

export type BenchmarkNote = {
  slug: string;
  name: string;
  category: string;
  measures: string;
  howToRead: string;
  useCases: string[];
};

export type EvidenceRow = {
  model: string;
  provider: string | null;
  inputPrice: number | null;
  outputPrice: number | null;
  contextWindow: number | null;
  benchmark: string;
  category: string;
  score: number;
  unit: string;
  note: string | null;
  measuredBy: string;
  published: string;
  sourceLabel: string;
  sourceUrl: string;
  compareSlug: string;
};

export type ModelEvidence = {
  goals: Goal[];
  benchmarks: BenchmarkNote[];
  rows: EvidenceRow[];
  /* A Compare link for the models in the evidence, with the goal set. */
  compareHref: string | null;
};

export type EvidenceIntent = {
  /* The question is about models or benchmarks at all. */
  relevant: boolean;
  /* It asks about models and not about tools, so product cards would be noise. */
  modelsOnly: boolean;
  goals: Goal[];
};

export function evidenceIntent(question: string): EvidenceIntent {
  const relevant = MODEL_WORDS.test(question);
  const goals = (Object.keys(GOAL_WORDS) as Goal[]).filter((g) => GOAL_WORDS[g].test(question));
  const modelsOnly = relevant && /\b(models?|llms?|benchmarks?)\b/i.test(question) && !TOOL_WORDS.test(question);
  return { relevant, modelsOnly, goals };
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function loadModelEvidence(question: string, intent: EvidenceIntent): Promise<ModelEvidence | null> {
  if (!intent.relevant || !isSupabaseConfigured()) return null;

  try {
    const db = createAnonClient();
    const { data: bData, error: bError } = await db
      .from("benchmarks")
      .select("slug, name, category, measures, how_to_read, use_cases")
      .order("name");
    if (bError) {
      console.error("[ai] benchmark catalogue failed", bError.code, bError.message);
      return null;
    }

    const all: BenchmarkNote[] = ((bData ?? []) as Record<string, unknown>[]).map((r) => ({
      slug: String(r.slug),
      name: String(r.name),
      category: String(r.category),
      measures: String(r.measures),
      howToRead: String(r.how_to_read),
      useCases: Array.isArray(r.use_cases) ? (r.use_cases as string[]) : [],
    }));

    /* A benchmark named in the question is always included. Otherwise the ones
       that measure the job asked about, and every benchmark when no job was
       named ("compare these models"). */
    const q = question.toLowerCase();
    const named = all.filter((b) => q.includes(b.name.toLowerCase().split(" ")[0].replace(/[^a-z-]/g, "")));
    const byGoal = intent.goals.length
      ? all.filter((b) => b.useCases.some((u) => (intent.goals as string[]).includes(u)))
      : [];
    const chosen = [...new Map([...named, ...byGoal].map((b) => [b.slug, b])).values()];
    const benchmarks = chosen.length > 0 ? chosen : all;

    const { data, error } = await db.rpc("model_evidence_for_ai", {
      p_benchmarks: benchmarks.map((b) => b.slug),
    });
    if (error) {
      console.error("[ai] model evidence failed", error.code, error.message);
      return { goals: intent.goals, benchmarks, rows: [], compareHref: null };
    }

    const rows: EvidenceRow[] = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      model: String(r.model),
      provider: (r.provider as string | null) ?? null,
      inputPrice: num(r.input_price_per_m),
      outputPrice: num(r.output_price_per_m),
      contextWindow: num(r.context_window),
      benchmark: String(r.benchmark),
      category: String(r.category),
      score: num(r.score) ?? 0,
      unit: String(r.unit),
      note: (r.note as string | null) ?? null,
      measuredBy: String(r.measured_by),
      published: String(r.published),
      sourceLabel: String(r.source_label),
      sourceUrl: String(r.source_url),
      compareSlug: String(r.compare_slug),
    }));

    const slugs = [...new Set(rows.map((r) => r.compareSlug))].slice(0, 6);
    const goal = intent.goals[0];
    const compareHref =
      slugs.length >= 2
        ? `/compare?view=models&items=${slugs.map((s) => `model:${s}`).join(",")}${goal ? `&goal=${goal}` : ""}#benchmarks`
        : null;

    return { goals: intent.goals, benchmarks, rows, compareHref };
  } catch (err) {
    console.error("[ai] model evidence threw", err);
    return null;
  }
}

/* The sources behind the evidence, for the Sources strip under the answer. */
export function evidenceSources(e: ModelEvidence | null): { title: string; url: string; snippet: string }[] {
  if (!e) return [];
  const seen = new Map<string, { title: string; url: string; snippet: string }>();
  for (const r of e.rows) {
    if (!seen.has(r.sourceUrl)) {
      seen.set(r.sourceUrl, {
        title: r.sourceLabel,
        url: r.sourceUrl,
        snippet: `Benchmark results published ${r.published}.`,
      });
    }
  }
  return [...seen.values()];
}
