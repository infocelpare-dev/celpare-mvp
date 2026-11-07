import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coercePlan, detectKind, fallbackPlan, skillLevel, DEFAULT_NEEDS } from "../deep-research/kinds";
import { poolResults, rankForReading } from "../deep-research/pool";
import { gapQueries } from "../deep-research/gaps";
import { unverifiedFigures } from "../deep-research/verify";
import { fetchPageText, htmlToText, isSafeUrl } from "../deep-research/fetch-page";
import { collectTable, splitRow } from "../rich-list";

const LIMITS = { queries: 4, needs: 6 };

describe("deep research kind (D231)", () => {
  it("reads build questions as build", () => {
    for (const q of [
      "I want to build a booking website for my salon, I can't code",
      "how do I set up an online store",
      "best tech stack for a SaaS MVP",
      "roadmap to launch a mobile app",
    ]) assert.equal(detectKind(q), "build", q);
  });

  it("reads tool choices as choose", () => {
    for (const q of ["Claude Code vs Codex vs Cursor", "best AI coding tool on a budget", "which image generator is cheapest"]) {
      assert.equal(detectKind(q), "choose", q);
    }
  });

  it("takes the planner's build only when the question is not a comparison", () => {
    const raw = '{"kind":"build","queries":["salon booking system"],"needs":["booking","payments"]}';
    assert.equal(coercePlan(raw, "I need a booking system for my salon", LIMITS)?.kind, "build");
    assert.equal(coercePlan(raw, "Calendly vs Acuity for my salon", LIMITS)?.kind, "choose");
  });

  it("falls back on unusable planner output", () => {
    assert.equal(coercePlan("sure! here are some queries", "x", LIMITS), null);
    assert.equal(coercePlan('{"queries": []}', "x", LIMITS), null);
    const p = fallbackPlan("I want to build a portfolio website", "portfolio website", LIMITS);
    assert.equal(p.kind, "build");
    assert.equal(p.queries.length, 4);
    assert.deepEqual(p.needs, DEFAULT_NEEDS);
  });

  it("deduplicates and caps planner queries, and gives build default needs when it names none", () => {
    const p = coercePlan('{"kind":"build","queries":["a","A","b","c","d","e"],"needs":[]}', "build me an app", LIMITS);
    assert.deepEqual(p?.queries, ["a", "b", "c", "d"]);
    assert.equal(p?.needs.length, 6);
  });

  it("finds the skill level from the question first, then the sign up role", () => {
    assert.equal(skillLevel("I can't code, help me make a site", "developer"), "no_code");
    assert.equal(skillLevel("build a site with Next.js", null), "developer");
    assert.equal(skillLevel("build a site", "developer"), "developer");
    assert.equal(skillLevel("build a site", "business"), "no_code");
    assert.equal(skillLevel("build a site", null), "unknown");
  });
});

describe("pooling and reading order", () => {
  const r = (url: string) => ({ title: url, url, snippet: "" });

  it("interleaves queries and deduplicates by URL", () => {
    const pooled = poolResults([[r("https://a.com/1"), r("https://a.com/2")], [r("https://a.com/1/"), r("https://b.com/1")]], 10);
    assert.deepEqual(pooled.map((p) => p.url), ["https://a.com/1", "https://a.com/2", "https://b.com/1"]);
  });

  it("reads a candidate's own site first, then docs and pricing paths", () => {
    const pooled = [r("https://blog.example.com/top-10"), r("https://other.com/pricing"), r("https://www.cursor.com/features")];
    assert.deepEqual(rankForReading(pooled, ["cursor.com"], 3), [2, 1, 0]);
  });
});

describe("gap queries", () => {
  it("asks once per tool for what the catalogue is missing, inside the room left", () => {
    const q = gapQueries({
      kind: "choose",
      missing: [
        { name: "Codex", dimension: "price_monthly" },
        { name: "Codex", dimension: "free_tier" },
        { name: "Windsurf", dimension: "context_window" },
        { name: "Cline", dimension: "benchmark_swe" },
      ],
      picks: [],
      already: [],
      max: 4,
    });
    assert.deepEqual(q, ["Codex pricing plans AI", "Windsurf limits and requirements AI"]);
  });

  it("scopes a gap search to the tool's own site when known (bolt.new, not hardware bolts)", () => {
    const q = gapQueries({ kind: "choose", missing: [{ name: "Bolt", dimension: "price", domain: "bolt.new" }], picks: [], already: [], max: 4 });
    assert.deepEqual(q, ["Bolt pricing plans site:bolt.new"]);
  });

  it("puts each build pick's setup guide first and respects the cap", () => {
    const q = gapQueries({ kind: "build", missing: [{ name: "Supabase", dimension: "price" }], picks: ["Framer", "Supabase", "Stripe"], already: [], max: 2 });
    assert.deepEqual(q, ["Framer quickstart setup guide", "Supabase quickstart setup guide"]);
  });
});

describe("fact check", () => {
  it("flags prices and percentages no source holds, and not ones a source holds", () => {
    const out = unverifiedFigures("Cursor is $20 a month, Codex is $25, and 50% faster. Pick 3 options in 2026.", ["Individual from $20/month", "it is 50 % faster"]);
    assert.deepEqual(out, ["$25"]);
  });

  it("does not match a number inside a longer one", () => {
    assert.deepEqual(unverifiedFigures("costs $20", ["costs $200"]), ["$20"]);
    assert.deepEqual(unverifiedFigures("costs $1,200", ["1200 a year"]), []);
  });
});

describe("page reading safety", () => {
  it("allows public https pages only", () => {
    assert.equal(isSafeUrl("https://docs.supabase.com/guides/getting-started"), true);
    for (const bad of [
      "http://example.com",
      "https://localhost/x",
      "https://127.0.0.1/",
      "https://10.0.0.5/admin",
      "https://[::1]/",
      "https://2130706433/",
      "https://0x7f.1/",
      "https://router.local/",
      "https://intranet.corp/",
      "https://user:pass@example.com/",
      "https://example.com:8443/",
      "file:///etc/passwd",
      "not a url",
    ]) assert.equal(isSafeUrl(bad), false, bad);
  });

  it("refuses a redirect to a private address", async () => {
    const calls: string[] = [];
    const fake = (async (url: string) => {
      calls.push(url);
      return new Response(null, { status: 302, headers: { location: "https://169.254.169.254/latest/meta-data" } });
    }) as unknown as typeof fetch;
    assert.equal(await fetchPageText("https://example.com/start", { fetchImpl: fake }), null);
    assert.deepEqual(calls, ["https://example.com/start"]);
  });

  it("reads html into text without scripts, styles or navigation", async () => {
    const html = `<html><head><title>Pricing</title><style>.a{}</style><script>alert(1)</script></head><body><nav>Home Docs</nav><h1>Plans</h1><p>Pro is $20 &amp; billed monthly.</p><!-- hidden --><footer>legal</footer></body></html>`;
    const text = htmlToText(html);
    assert.match(text, /Pricing/);
    assert.match(text, /Pro is \$20 & billed monthly\./);
    for (const gone of ["alert", ".a{}", "Home Docs", "hidden", "legal"]) assert.ok(!text.includes(gone), gone);
  });

  it("refuses a non text response", async () => {
    const fake = (async () => new Response("%PDF", { status: 200, headers: { "content-type": "application/pdf" } })) as unknown as typeof fetch;
    assert.equal(await fetchPageText("https://example.com/a.pdf", { fetchImpl: fake }), null);
  });
});

describe("tables", () => {
  it("parses a GFM table and pads short rows", () => {
    const lines = ["| Option | Price | Best for |", "|---|:---:|---|", "| Cursor | $20 | IDE |", "| Cline | Free |", "", "after"];
    const t = collectTable(lines, 0);
    assert.deepEqual(t?.header, ["Option", "Price", "Best for"]);
    assert.deepEqual(t?.rows, [["Cursor", "$20", "IDE"], ["Cline", "Free", ""]]);
    assert.equal(t?.end, 4);
  });

  it("is not a table until the separator arrives (mid stream)", () => {
    assert.equal(collectTable(["| Option | Price |"], 0), null);
    assert.equal(collectTable(["a sentence with a | pipe", "and more"], 0), null);
  });

  it("keeps an escaped pipe inside a cell", () => {
    assert.deepEqual(splitRow("| a \\| b | c |"), ["a | b", "c"]);
  });
});
