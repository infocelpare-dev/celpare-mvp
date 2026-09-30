import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluate, ndcgAtK, precisionAtK, recallAtK, reciprocalRank, type Judgement } from "../evaluation";
import { bySlug, run, snapshotIndex } from "./helpers";

/*
  The judgement set (guide 17 section 16). Written by hand on 2026-09-28 from the
  live catalogue snapshot: for each seed, the entries a knowledgeable person would
  call genuinely similar (2) or reasonable (1). Real products, real rows; nothing
  here is a ranking Celpare publishes, it is the yardstick the engine is held to.
*/
const index = snapshotIndex();
const k = (type: "tool" | "model", slug: string) => bySlug(index, type, slug).key;

const TOOL_JUDGEMENTS: Judgement[] = [
  { seed: k("tool", "cursor"), relevant: { [k("tool", "windsurf")]: 2, [k("tool", "github-copilot")]: 2, [k("tool", "cline")]: 2, [k("tool", "claude-code")]: 2, [k("tool", "replit")]: 1, [k("tool", "bolt-new")]: 1, [k("tool", "v0")]: 1 } },
  { seed: k("tool", "runway"), relevant: { [k("tool", "pika")]: 2, [k("tool", "kling")]: 2, [k("tool", "luma-dream-machine")]: 2, [k("tool", "sora")]: 2, [k("tool", "descript")]: 1, [k("tool", "synthesia")]: 1, [k("tool", "heygen")]: 1 } },
  { seed: k("tool", "midjourney"), relevant: { [k("tool", "leonardo-ai")]: 2, [k("tool", "ideogram")]: 2, [k("tool", "flux")]: 2, [k("tool", "stable-diffusion")]: 2, [k("tool", "adobe-firefly")]: 2 } },
  { seed: k("tool", "elevenlabs"), relevant: { [k("tool", "murf")]: 2, [k("tool", "assemblyai")]: 1, [k("tool", "suno")]: 1, [k("tool", "udio")]: 1 } },
  { seed: k("tool", "pinecone"), relevant: { [k("tool", "qdrant")]: 2, [k("tool", "weaviate")]: 2, [k("tool", "chroma")]: 2, [k("tool", "supabase")]: 1, [k("tool", "neon")]: 1 } },
  { seed: k("tool", "perplexity"), relevant: { [k("tool", "consensus")]: 2, [k("tool", "exa")]: 1, [k("tool", "tavily")]: 1 } },
  { seed: k("tool", "zapier"), relevant: { [k("tool", "make")]: 2, [k("tool", "n8n")]: 2, [k("tool", "dify")]: 1 } },
  { seed: k("tool", "claude"), relevant: { [k("tool", "chatgpt")]: 2, [k("tool", "gemini")]: 2, [k("tool", "mistral-le-chat")]: 2, [k("tool", "grok")]: 2, [k("tool", "deepseek")]: 2 } },
  { seed: k("tool", "langchain"), relevant: { [k("tool", "crewai")]: 2, [k("tool", "dify")]: 1, [k("tool", "langsmith")]: 1 } },
  { seed: k("tool", "suno"), relevant: { [k("tool", "udio")]: 2, [k("tool", "elevenlabs")]: 1 } },
];

const MODEL_JUDGEMENTS: Judgement[] = [
  { seed: k("model", "claude-opus-5-5"), relevant: { [k("model", "gpt-6-astra")]: 2, [k("model", "claude-opus-5")]: 2, [k("model", "claude-fable-5-1")]: 2, [k("model", "gpt-6-sol")]: 1, [k("model", "grok-4-7")]: 1, [k("model", "gemini-3-8-flash")]: 1 } },
  { seed: k("model", "gpt-6-sol"), relevant: { [k("model", "gpt-5-6-sol")]: 2, [k("model", "claude-sonnet-5")]: 2, [k("model", "grok-4-7")]: 1, [k("model", "gemini-3-8-flash")]: 1 } },
  { seed: k("model", "gemini-3-8-flash"), relevant: { [k("model", "deepseek-v4-1-flash")]: 2, [k("model", "gpt-5-6-sol")]: 1, [k("model", "claude-sonnet-5")]: 1 } },
  { seed: k("model", "deepseek-v4-1-flash"), relevant: { [k("model", "gemini-3-8-flash")]: 2, [k("model", "gpt-5-6-sol")]: 1, [k("model", "claude-sonnet-5")]: 1 } },
];

const rankSimilar = (type: "tool" | "model") => (seed: string) =>
  run({ strategy: "similar", seeds: [index.entities.get(seed)!.ref], entityTypes: [type], limit: 10 }).items.map((i) => i.key);

describe("metrics", () => {
  it("compute the textbook values", () => {
    const rel = { a: 2, b: 1 };
    assert.equal(precisionAtK(["a", "x", "b"], rel, 2), 0.5);
    assert.equal(recallAtK(["a", "x", "b"], rel, 3), 1);
    assert.equal(reciprocalRank(["x", "a"], rel), 0.5);
    assert.equal(ndcgAtK(["a", "b"], rel, 2), 1);
    assert.ok(ndcgAtK(["b", "a"], rel, 2) < 1);
  });
});

describe("baseline on the judgement set (regression guard)", () => {
  const eligible = index.list.filter((e) => !e.fixture).length;

  it("similar tools", () => {
    const r = evaluate(TOOL_JUDGEMENTS, rankSimilar("tool"), index, eligible);
    console.log("  similar tools:", JSON.stringify(r));
    /* Measured 2026-09-28: NDCG@5 0.97, Recall@10 1.0, MRR 1.0. */
    assert.ok(r.ndcg5 >= 0.9, `NDCG@5 ${r.ndcg5}`);
    assert.ok(r.recall10 >= 0.95, `Recall@10 ${r.recall10}`);
    assert.ok(r.mrr >= 0.95, `MRR ${r.mrr}`);
  });

  it("similar models", () => {
    const r = evaluate(MODEL_JUDGEMENTS, rankSimilar("model"), index, eligible);
    console.log("  similar models:", JSON.stringify(r));
    /* Measured 2026-09-28: NDCG@5 0.78, Recall@10 0.92. */
    assert.ok(r.ndcg5 >= 0.7, `NDCG@5 ${r.ndcg5}`);
    assert.ok(r.recall10 >= 0.85, `Recall@10 ${r.recall10}`);
  });
});
