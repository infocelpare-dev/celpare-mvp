import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { SPONSORSHIP_PRICE_CENTS } from "../../sponsored/config";
import { DEVELOPER_PLANS, INDIVIDUAL_PLANS, yearlyCents } from "../plans";

/*
  The amount a billing request is invoiced is read from public.billing_prices
  (phase BILL, D239), seeded by the migration. /pricing reads plans.ts. If the
  two ever disagree, a customer is invoiced a different amount from the one
  they were shown. This test reads the seed straight from the migration file
  and fails on any difference, in either direction.
*/

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");
const file = readdirSync(MIGRATIONS).find((f) => f.endsWith("_billing_manual_v1.sql"));

function seededPrices(): Map<string, number> {
  assert.ok(file, "billing_manual_v1 migration not found");
  const sql = readFileSync(join(MIGRATIONS, file), "utf8");
  const block = sql.match(/insert into public\.billing_prices[^;]*;/i);
  assert.ok(block, "billing_prices seed not found");
  const rows = new Map<string, number>();
  for (const m of block[0].matchAll(/\('(\w+)',\s*'(\w+)',\s*'(\w+)',\s*(\d+)\)/g)) {
    rows.set(`${m[1]}/${m[2]}/${m[3]}`, Number(m[4]));
  }
  return rows;
}

function expectedPrices(): Map<string, number> {
  const rows = new Map<string, number>();
  for (const [kind, plans] of [
    ["individual", INDIVIDUAL_PLANS],
    ["developer", DEVELOPER_PLANS],
  ] as const) {
    for (const p of plans) {
      if (p.monthlyCents === 0) continue;
      rows.set(`${kind}/${p.id}/monthly`, p.monthlyCents);
      rows.set(`${kind}/${p.id}/yearly`, yearlyCents(p));
    }
  }
  rows.set("sponsorship/sponsored/monthly", SPONSORSHIP_PRICE_CENTS);
  return rows;
}

describe("billing_prices seed", () => {
  it("matches every paid price shown on /pricing, and nothing else", () => {
    assert.deepEqual(
      [...seededPrices()].sort(),
      [...expectedPrices()].sort(),
    );
  });

  it("has no free plan", () => {
    for (const [key, cents] of seededPrices()) assert.ok(cents > 0, key);
  });
});
