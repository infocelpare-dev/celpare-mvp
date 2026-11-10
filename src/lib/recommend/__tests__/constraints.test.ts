import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateConstraint, parseConstraints, resolveMentions } from "../constraints";
import { bySlug, run, slugs, snapshotIndex } from "./helpers";

const index = snapshotIndex();
const kinds = (q: string) => parseConstraints(q, index).constraints.map((c) => `${c.kind}=${c.value}`);

describe("constraint parsing (D182)", () => {
  it("reads budget, platform, openness, context and capability", () => {
    const k = kinds("an open source tool under $15 that runs on Linux");
    assert.ok(k.includes("budget_max=15"));
    assert.ok(k.includes("platform=linux"));
    assert.ok(k.includes("open=open_source"));
    assert.ok(k.includes("entity_type=tool"));
    assert.ok(kinds("a model with 1M token context").includes("min_context=1000000"));
    assert.ok(kinds("models with function calling").includes("capability=tool_calling"));
  });

  it('"tool calling" asks about models, not tools', () => {
    const p = parseConstraints("which model is best for agents with tool calling", index);
    assert.deepEqual(p.entityTypes, ["model"]);
  });

  it("resolves named products to catalogue entries, longest name first", () => {
    const m = resolveMentions("is Claude Code better than Cursor?", index).map((e) => e.slug);
    assert.deepEqual(m, ["claude-code", "cursor"]);
  });

  it("a product we do not carry is reported, never guessed", () => {
    const p = parseConstraints("something cheaper than Zorblax Pro for coding", index);
    assert.ok(p.unresolved.some((u) => u.includes("zorblax")));
    assert.ok(!p.constraints.some((c) => c.kind === "cheaper_than"));
  });
});

describe("constraint evaluation", () => {
  it("unknown is never a violation: a tool with no plan price is kept", () => {
    const q = parseConstraints("a video tool under $10 a month", index);
    const budget = q.constraints.find((c) => c.kind === "budget_max")!;
    const pika = bySlug(index, "tool", "pika");
    const status = evaluateConstraint(pika, budget, index).status;
    assert.notEqual(status, "violated");
  });

  it("a recorded no is a violation: a closed model fails open weights", () => {
    const c = { kind: "open" as const, value: "open_weights", hard: true, phrase: "open weights" };
    assert.equal(evaluateConstraint(bySlug(index, "model", "deepseek-v4-1-flash"), c, index).status, "satisfied");
    const claude = bySlug(index, "model", "claude-opus-5-5");
    const expected = claude.openWeights === "not_recorded" ? "unknown" : "violated";
    assert.equal(evaluateConstraint(claude, c, index).status, expected);
  });

  it("a platform missing from a listing is not listed, not unsupported", () => {
    const c = { kind: "platform" as const, value: "linux", hard: true, phrase: "linux" };
    const r = evaluateConstraint(bySlug(index, "tool", "midjourney"), c, index);
    assert.notEqual(r.status, "violated");
  });
});

describe("fit (Ask Celpare)", () => {
  it('"cheaper than Cursor" excludes Cursor and anything not cheaper', () => {
    const q = "I need a cheap AI coding tool for TypeScript, cheaper than Cursor";
    const p = parseConstraints(q, index);
    const r = run({ strategy: "fit", surface: "ask", query: q, constraints: p.constraints, entityTypes: p.entityTypes, limit: 5 });
    const s = slugs(r);
    assert.ok(!s.includes("cursor"));
    assert.ok(s.length >= 3);
    for (const it of r.items) {
      const cheaper = it.fit!.constraints.find((c) => c.constraint.kind === "cheaper_than")!;
      assert.notEqual(cheaper.status, "violated", it.key);
    }
    assert.ok(r.rejected.some((x) => x.code === "failed_constraint"));
  });

  it("returns only catalogue entries, each with a fit report and no score", () => {
    const q = "open weights model with 1M context for long documents";
    const p = parseConstraints(q, index);
    const r = run({ strategy: "fit", surface: "ask", query: q, constraints: p.constraints, entityTypes: p.entityTypes, limit: 5 });
    assert.equal(slugs(r)[0], "deepseek-v4-1-flash");
    for (const it of r.items) {
      assert.ok(index.entities.has(it.key));
      assert.ok(it.fit);
      assert.ok(!("score" in it));
    }
    /* A model with a recorded context under 1M is ruled out by the hard constraint. */
    assert.ok(r.rejected.some((x) => x.key === bySlug(index, "model", "grok-4-7").key && x.code === "failed_constraint"));
  });
});

describe("a use case question keeps to its use case (D230)", () => {
  const ask = (q: string, limit = 6) => {
    const p = parseConstraints(q, index);
    return run({ strategy: "fit", surface: "ask", query: q, constraints: p.constraints, entityTypes: ["tool"], limit, section: "ask" });
  };

  it("fills a coding answer with coding tools, not the category cap's leftovers", () => {
    const r = ask("Find the best AI coding tools.");
    const s = slugs(r);
    assert.equal(s.length, 6);
    for (const slug of ["cursor", "claude-code", "github-copilot"]) assert.ok(s.includes(slug), `${slug} missing from ${s.join(", ")}`);
    assert.ok(!r.rejected.some((x) => x.code === "diversity_limit" && x.key === bySlug(index, "tool", "github-copilot").key));
    for (const off of ["dify", "runway"]) assert.ok(!s.includes(off), `${off} should not answer a coding question`);
  });

  it("puts tools listed for coding ahead of a general assistant that can code", () => {
    const s = slugs(ask("Find the best AI coding tools.", 8));
    const claude = s.indexOf("claude");
    for (const slug of ["cursor", "claude-code", "github-copilot", "windsurf"]) {
      const at = s.indexOf(slug);
      if (at >= 0 && claude >= 0) assert.ok(at < claude, `${slug} should rank above claude in ${s.join(", ")}`);
    }
  });

  it("leaves a general assistant out of a coding answer when enough coding tools are listed", () => {
    const r = ask("Find the best AI coding tools.", 8);
    assert.ok(!slugs(r).includes("claude"), slugs(r).join(", "));
    assert.ok(r.rejected.some((x) => x.key === bySlug(index, "tool", "claude").key && x.code === "off_goal"));
  });

  it("drops tools that do not serve the use case, recorded as off_goal", () => {
    const r = ask("best ai tools for coding");
    assert.ok(r.rejected.some((x) => x.code === "off_goal"));
  });

  it("does not read \"I can't code\" or \"no code\" as a coding question", () => {
    for (const q of ["I want to build a booking website for my salon, I can't code", "no code website builder", "I don't know how to code, make me an app"]) {
      const goals = parseConstraints(q, index).constraints.filter((c) => c.kind === "usecase").map((c) => c.value);
      assert.ok(!goals.includes("coding"), `${q}: ${goals.join(", ")}`);
    }
    assert.ok(parseConstraints("best tool for coding", index).constraints.some((c) => c.kind === "usecase" && c.value === "coding"));
  });

  it("reads a photo that should move as video, not image", () => {
    const goals = (q: string) => parseConstraints(q, index).constraints.filter((c) => c.kind === "usecase").map((c) => c.value);
    for (const q of [
      "Is there an AI that can make my grandma's old photo move?",
      "bring my old pictures to life",
      "animate a photo of my dog",
      "turn this image into a video",
      "best image-to-video tool",
    ]) {
      const g = goals(q.toLowerCase());
      assert.ok(g.includes("video") && !g.includes("image"), `${q}: ${g.join(", ")}`);
    }
    assert.deepEqual(goals("make a logo for my bakery"), ["image"]);
    assert.ok(goals("edit my photos and make a video").includes("image"));
  });

  it("does not reject the image to video tools for the photo question", () => {
    const r = ask("Is there an AI that can make my grandma's old photo move?".toLowerCase(), 8);
    assert.ok(!r.rejected.some((x) => x.key === bySlug(index, "tool", "kling").key && x.code === "off_goal"), r.rejected.map((x) => x.key).join(", "));
  });

  it("leaves a question with no use case as it was", () => {
    const r = ask("free tools under $10");
    assert.ok(!r.rejected.some((x) => x.code === "off_goal"));
  });
});
