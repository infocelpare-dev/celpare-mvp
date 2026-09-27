import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRequest, parseScenario, parseWeights, setKeyOf } from "../request";
import { uid } from "./fixtures";

const t = (n: string) => ({ type: "tool" as const, id: uid(`tool-${n}`) });
const m = (n: string) => ({ type: "model" as const, id: uid(`model-${n}`) });

describe("compare_v1 request", () => {
  it("rejects 0 and 1 entities", () => {
    assert.deepEqual(buildRequest({ entities: [] }), { ok: false, error: "too_few" });
    assert.deepEqual(buildRequest({ entities: [t("a")] }), { ok: false, error: "too_few" });
  });

  it("accepts 2 and 5+ entities", () => {
    assert.equal(buildRequest({ entities: [t("a"), t("b")] }).ok, true);
    assert.equal(buildRequest({ entities: ["a", "b", "c", "d", "e", "f"].map(t) }).ok, true);
  });

  it("rejects more than the engine ceiling", () => {
    const many = Array.from({ length: 13 }, (_, i) => t(`x${i}`));
    assert.deepEqual(buildRequest({ entities: many }), { ok: false, error: "too_many" });
  });

  it("rejects duplicates rather than repairing them", () => {
    assert.deepEqual(buildRequest({ entities: [t("a"), t("a")] }), { ok: false, error: "duplicate" });
  });

  it("rejects an invalid id or type", () => {
    assert.deepEqual(buildRequest({ entities: [t("a"), { type: "tool", id: "not-a-uuid" }] }), { ok: false, error: "invalid" });
    assert.deepEqual(buildRequest({ entities: [t("a"), { type: "course" as never, id: uid("c") }] }), { ok: false, error: "invalid" });
  });

  it("picks the strategy from the entity types", () => {
    const r1 = buildRequest({ entities: [t("a"), t("b")] });
    const r2 = buildRequest({ entities: [m("a"), m("b")] });
    const r3 = buildRequest({ entities: [t("a"), m("b")] });
    assert.ok(r1.ok && r2.ok && r3.ok);
    assert.equal(r1.request.strategy, "tool");
    assert.equal(r2.request.strategy, "model");
    assert.equal(r3.request.strategy, "mixed");
  });

  it("refuses a mixed set when the caller does not allow one", () => {
    assert.deepEqual(buildRequest({ entities: [t("a"), m("b")], allowMixed: false }), { ok: false, error: "unsupported" });
  });

  it("gives A,B,C and C,B,A one set key and keeps each display order", () => {
    const abc = buildRequest({ entities: [t("a"), t("b"), t("c")] });
    const cba = buildRequest({ entities: [t("c"), t("b"), t("a")] });
    assert.ok(abc.ok && cba.ok);
    assert.equal(abc.request.setKey, cba.request.setKey);
    assert.deepEqual(cba.request.entities.map((e) => e.id), [t("c").id, t("b").id, t("a").id]);
    assert.equal(setKeyOf([t("a"), t("b")]), setKeyOf([t("b"), t("a")]));
  });

  it("parses and clamps weights, ignoring unknown keys", () => {
    assert.deepEqual(parseWeights("price:3,quality:9,nonsense:2,speed:x"), { price: 3, quality: 5 });
    assert.equal(parseWeights(""), null);
    assert.equal(parseWeights("junk"), null);
  });

  it("parses an explicit scenario and refuses a malformed or empty one", () => {
    assert.deepEqual(parseScenario("1000000:250000"), { inputTokens: 1_000_000, outputTokens: 250_000 });
    assert.equal(parseScenario("0:0"), null);
    assert.equal(parseScenario("1e6:2"), null);
    assert.equal(parseScenario("-1:5"), null);
  });
});
