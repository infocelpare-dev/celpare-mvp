import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cleanRef, GOALS, HEARD_FROM, ROLES, STEPS } from "../options";
import { declaredFrom, declaredWeight, hasDeclared, NO_DECLARED, PRIOR } from "../prior";
import { declaredRelevance } from "../../community/intelligence/features";
import type { ContentItem } from "../../community/intelligence/types";
import { buildExploreProfile } from "../../explore/intelligence/profile";
import { buildUserContext } from "../../recommend/user";
import type { CatalogueIndex } from "../../recommend/catalogue";

const TOPIC = "11111111-1111-4111-8111-111111111111";
const TOOL = "22222222-2222-4222-8222-222222222222";
const NOW = Date.parse("2026-10-31T12:00:00Z");

describe("Options", () => {
  it("every list has unique keys", () => {
    for (const list of [ROLES, GOALS, HEARD_FROM]) {
      const keys = list.map((c) => c.key);
      assert.equal(new Set(keys).size, keys.length);
    }
  });

  it("has the everyday choices, not only job titles (founder 2026-10-31)", () => {
    const keys = ROLES.map((r) => r.key as string);
    for (const k of ["everyday", "professional", "hobbyist", "curious"]) assert.ok(keys.includes(k), k);
  });

  it("asks six questions in order", () => {
    assert.deepEqual([...STEPS], ["role", "goals", "interests", "tools", "heard", "people"]);
  });

  it("keeps only safe campaign tags", () => {
    assert.equal(cleanRef("TikTok-Gems"), "tiktok-gems");
    assert.equal(cleanRef(" x_launch "), "x_launch");
    assert.equal(cleanRef("<script>"), "script");
    assert.equal(cleanRef("!!!"), null);
    assert.equal(cleanRef(null), null);
    assert.equal(cleanRef("a".repeat(80))?.length, 40);
  });
});

describe("Declared prior", () => {
  it("starts at the full weight and fades to nothing at FADE_AT", () => {
    assert.equal(declaredWeight(0), PRIOR.WEIGHT);
    assert.ok(Math.abs(declaredWeight(PRIOR.FADE_AT / 2) - PRIOR.WEIGHT / 2) < 1e-9);
    assert.equal(declaredWeight(PRIOR.FADE_AT), 0);
    assert.equal(declaredWeight(PRIOR.FADE_AT * 5), 0);
  });

  it("only ever falls as evidence grows", () => {
    let prev = Infinity;
    for (let e = 0; e <= 30; e++) {
      const w = declaredWeight(e);
      assert.ok(w <= prev);
      prev = w;
    }
  });

  it("reads the answers row and ignores junk", () => {
    const d = declaredFrom({ topic_ids: [TOPIC, 4], tool_ids: "x", category_ids: [], goals: ["learn"], role: "student" });
    assert.deepEqual(d.topicIds, [TOPIC]);
    assert.deepEqual(d.toolIds, []);
    assert.equal(d.role, "student");
    assert.equal(hasDeclared(d), true);
    assert.deepEqual(declaredFrom(null), NO_DECLARED);
    assert.equal(hasDeclared(NO_DECLARED), false);
  });
});

describe("Feed", () => {
  const item = (topicId: string | null, toolId: string | null = null) => ({ topicId, toolId }) as unknown as ContentItem;
  const declared = { topics: new Set([TOPIC]), tools: new Set([TOOL]), weight: declaredWeight(0) };

  it("lifts a post in a picked topic or about a picked tool", () => {
    assert.equal(declaredRelevance(item(TOPIC), declared), PRIOR.WEIGHT);
    assert.equal(declaredRelevance(item(null, TOOL), declared), PRIOR.WEIGHT);
  });

  it("leaves everything else, and everyone without picks, unchanged", () => {
    assert.equal(declaredRelevance(item("other"), declared), 0);
    assert.equal(declaredRelevance(item(TOPIC), undefined), 0);
    assert.equal(declaredRelevance(item(TOPIC), { ...declared, weight: declaredWeight(PRIOR.FADE_AT) }), 0);
  });
});

describe("Explore", () => {
  const base = { userId: "u1", community: null, affinity: null, history: [], owned: [], keysOf: () => undefined, now: NOW };

  it("a new account with picks is not cold, and its picks are interests", () => {
    const p = buildExploreProfile({ ...base, declared: [`topic:${TOPIC}`, "category:video"] });
    assert.equal(p.cold, false);
    assert.equal(p.long.get(`topic:${TOPIC}`), PRIOR.WEIGHT);
    assert.equal(p.long.get("category:video"), PRIOR.WEIGHT);
  });

  it("without picks nothing changes: still cold", () => {
    const p = buildExploreProfile(base);
    assert.equal(p.cold, true);
    assert.equal(p.long.size, 0);
  });
});

describe("Tool and Model engine", () => {
  const index = { entities: new Map(), list: [] } as unknown as CatalogueIndex;
  const input = { userId: "u1", activity: [], now: NOW };

  it("picked categories become interests and tools in use become owned", () => {
    const u = buildUserContext({ ...input, declared: ["category:voice and audio", `tool:${TOOL}`, `topic:${TOPIC}`] }, index);
    assert.equal(u.cold, false);
    assert.equal(u.long.get("category:voice-and-audio"), PRIOR.WEIGHT);
    assert.ok(u.owned.has(`tool:${TOOL}`));
    /* Topics are content and never enter the tool and model profile (D173). */
    assert.equal([...u.long.keys()].some((k) => k.startsWith("topic:")), false);
  });

  it("without picks nothing changes", () => {
    const u = buildUserContext(input, index);
    assert.equal(u.cold, true);
    assert.equal(u.owned.size, 0);
  });
});
