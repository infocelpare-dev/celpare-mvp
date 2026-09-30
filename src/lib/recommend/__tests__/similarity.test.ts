import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildIndex } from "../catalogue";
import type { EntityInput } from "../entity";
import { structuredSimilarity } from "../similarity/structured";
import { bySlug, NOW, snapshotIndex } from "./helpers";

const tool = (id: string, over: Partial<EntityInput> = {}): EntityInput => ({
  type: "tool",
  id,
  slug: id,
  name: id,
  tagline: `${id} tagline`,
  description: "a description long enough to count as a real description of the tool here",
  tags: [],
  features: [],
  platforms: [],
  categories: [],
  pricingModel: "freemium",
  listingQuality: 0.5,
  listingPenalty: 0,
  createdAt: NOW - 86_400_000 * 200,
  ...over,
});

describe("similarity (D175)", () => {
  it("the matrix is symmetric and an entry is identical to itself", () => {
    const index = snapshotIndex();
    const a = bySlug(index, "tool", "cursor");
    const b = bySlug(index, "tool", "windsurf");
    assert.equal(index.sim(a.key, b.key).value, index.sim(b.key, a.key).value);
    assert.equal(index.sim(a.key, a.key).value, 1);
  });

  it("near substitutes score far above different kinds of tool", () => {
    const index = snapshotIndex();
    const cursor = bySlug(index, "tool", "cursor").key;
    const near = index.sim(cursor, bySlug(index, "tool", "windsurf").key).value;
    const far = index.sim(cursor, bySlug(index, "tool", "elevenlabs").key).value;
    assert.ok(near > 0.4, `windsurf ${near}`);
    assert.ok(far < 0.15, `elevenlabs ${far}`);
    assert.ok(near > 3 * far);
  });

  it("a missing attribute is left out, never scored as a mismatch", () => {
    const index = buildIndex({
      entities: [
        tool("a", { categories: ["Coding"], tags: ["editor"], platforms: ["macOS"] }),
        tool("b", { categories: ["Coding"], tags: ["editor"], platforms: [] }),
        tool("c", { categories: ["Coding"], tags: ["editor"], platforms: ["Windows"] }),
      ],
      generation: "t",
      now: NOW,
    });
    const [a, b, c] = ["a", "b", "c"].map((id) => index.entities.get(`tool:${id}`)!);
    const unknownPlatforms = structuredSimilarity.similarity(a, b);
    const knownMismatch = structuredSimilarity.similarity(a, c);
    assert.equal(unknownPlatforms.parts.platform, undefined, "no platform part when one side has none");
    assert.equal(knownMismatch.parts.platform, 0);
    assert.ok(unknownPlatforms.value > knownMismatch.value);
  });

  it("tools and models never share a similarity score", () => {
    const index = snapshotIndex();
    const claudeTool = bySlug(index, "tool", "claude");
    const claudeModel = bySlug(index, "model", "claude-opus-5-5");
    assert.equal(index.sim(claudeTool.key, claudeModel.key).value, 0);
    assert.equal(index.hybrid.similarity(claudeTool, claudeModel).value, 0);
  });

  it("common words carry little: IDF favours distinctive terms", () => {
    const index = snapshotIndex();
    const pinecone = bySlug(index, "tool", "pinecone");
    const shared = index.lexical.sharedTerms(pinecone, bySlug(index, "tool", "qdrant"));
    assert.ok(shared.some((t) => t === "vector" || t === "rag" || t === "db"), shared.join());
  });

  it("the index builds in well under a second for the live catalogue", () => {
    const started = Date.now();
    buildIndex({ entities: [...Array(3)].flatMap(() => []), generation: "x", now: NOW });
    const t0 = Date.now();
    snapshotIndex();
    assert.ok(Date.now() - t0 < 1000);
    assert.ok(Date.now() - started < 2000);
  });
});
