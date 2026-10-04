import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PLAN_LIMITS } from "../../ai/config";
import {
  DEVELOPER_COMPARE,
  DEVELOPER_PLANS,
  INDIVIDUAL_COMPARE,
  INDIVIDUAL_PLANS,
  bestYearlyPercent,
  formatUsd,
  yearlyCents,
  yearlySaving,
} from "../plans";

const all = [...INDIVIDUAL_PLANS, ...DEVELOPER_PLANS];

describe("prices", () => {
  it("are the Notion prices", () => {
    assert.deepEqual(INDIVIDUAL_PLANS.map((p) => p.monthlyCents), [0, 799, 1999]);
    assert.deepEqual(DEVELOPER_PLANS.map((p) => p.monthlyCents), [0, 2000, 5000]);
  });

  it("use the founder's yearly prices for Pro and Premium (D197)", () => {
    assert.equal(formatUsd(yearlyCents(INDIVIDUAL_PLANS[1])), "$89.99");
    assert.equal(formatUsd(yearlyCents(INDIVIDUAL_PLANS[2])), "$199.99");
  });

  it("bill other plans yearly at exactly twelve months", () => {
    for (const p of DEVELOPER_PLANS) assert.equal(yearlyCents(p), p.monthlyCents * 12);
    assert.equal(formatUsd(yearlyCents(DEVELOPER_PLANS[2])), "$600");
    assert.equal(yearlySaving(DEVELOPER_PLANS[1]), null);
    assert.equal(bestYearlyPercent(DEVELOPER_PLANS), null);
  });

  it("compute savings and never round them up", () => {
    assert.deepEqual(yearlySaving(INDIVIDUAL_PLANS[1]), { cents: 589, fullCents: 9588, percent: 6 });
    // 39.89 of 239.88 is 16.63%, shown as 16, never 17.
    assert.deepEqual(yearlySaving(INDIVIDUAL_PLANS[2]), { cents: 3989, fullCents: 23988, percent: 16 });
    assert.equal(yearlySaving(INDIVIDUAL_PLANS[0]), null);
    assert.equal(bestYearlyPercent(INDIVIDUAL_PLANS), 16);
  });

  it("make a year never cost more than twelve months", () => {
    for (const p of [...INDIVIDUAL_PLANS, ...DEVELOPER_PLANS]) {
      assert.ok(yearlyCents(p) <= p.monthlyCents * 12, p.name);
    }
  });

  it("rise with each plan", () => {
    for (const list of [INDIVIDUAL_PLANS, DEVELOPER_PLANS]) {
      for (let i = 1; i < list.length; i++) {
        assert.ok(list[i].monthlyCents > list[i - 1].monthlyCents);
      }
    }
  });

  it("format whole dollars without cents", () => {
    assert.equal(formatUsd(0), "$0");
    assert.equal(formatUsd(799), "$7.99");
    assert.equal(formatUsd(2000), "$20");
  });
});

describe("individual plans", () => {
  it("use profiles.plan ids so Current plan can match", () => {
    assert.deepEqual(INDIVIDUAL_PLANS.map((p) => p.id), ["free", "pro", "premium"]);
  });

  it("promise the caps the database enforces", () => {
    const [free, pro] = INDIVIDUAL_PLANS;
    assert.ok(free.features.includes(`Save up to ${PLAN_LIMITS.free.savedTools} tools`));
    assert.ok(pro.features.includes(`Save up to ${PLAN_LIMITS.pro.savedTools} tools`));
    assert.ok(pro.features.includes(`${PLAN_LIMITS.pro.collections} collections`));
    assert.ok(INDIVIDUAL_PLANS[2].features.includes("Unlimited collections"));
  });
});

describe("compare tables", () => {
  it("have one cell per plan in every row", () => {
    for (const [groups, n] of [
      [INDIVIDUAL_COMPARE, INDIVIDUAL_PLANS.length],
      [DEVELOPER_COMPARE, DEVELOPER_PLANS.length],
    ] as const) {
      for (const g of groups) for (const r of g.rows) assert.equal(r.cells.length, n, r.label);
    }
  });
});

describe("copy", () => {
  it("has no em dash (hard rule 1)", () => {
    const text = JSON.stringify([all, INDIVIDUAL_COMPARE, DEVELOPER_COMPARE]);
    assert.ok(!text.includes(String.fromCharCode(0x2014)));
  });
});
