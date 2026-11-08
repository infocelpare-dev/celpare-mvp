/*
  Celpare production smoke test (phase OPS, step 4).

    node scripts/smoke.mjs <base-url> [expected-commit-sha]

  Run by deploy.yml after a deploy and by rollback.yml after a rollback.
  Passes only when, on the same attempt:
  - /api/health?db=1 answers 200 with status ok and db ok,
  - its commit equals the expected one (when given), proving the build that
    passed CI is the one serving traffic, not an older version or a cache,
  - the key public pages answer 200,
  - the security headers set in next.config.ts are present.

  Five attempts with growing waits (a fresh version can take a few seconds to
  reach every edge), then exit 1. It never loops forever, and it never retries
  a deploy or a rollback itself: that decision belongs to the workflow.

  No dependencies. Prints no response bodies.
*/

const base = (process.argv[2] ?? "").replace(/\/+$/, "");
const expected = (process.argv[3] ?? "").trim();

if (!/^https?:\/\//.test(base)) {
  console.error("Usage: node scripts/smoke.mjs <base-url> [expected-commit-sha]");
  process.exit(2);
}

const PAGES = ["/", "/explore", "/compare", "/pricing", "/login", "/help", "/sitemap.xml", "/robots.txt"];
const HEADERS = [
  "strict-transport-security",
  "x-content-type-options",
  "x-frame-options",
  "referrer-policy",
  "permissions-policy",
  "content-security-policy",
];
const WAITS_S = [0, 5, 10, 20, 30];
const TIMEOUT_MS = 20_000;
/* Warm up before judging (2026-11-07). A fresh Worker version starts cold on
   every Cloudflare server, and on the free plan's 10 ms CPU limit the first
   requests often fail with 1102 while warm ones pass; deploy #17 was rolled
   back for exactly that. Each round requests every page once and ignores the
   result. Real breakage still fails every attempt after it. 0 turns it off. */
const WARMUP_ROUNDS = Math.max(0, Number(process.env.SMOKE_WARMUP_ROUNDS ?? 3) || 0);
const WARMUP_GAP_S = 5;

async function get(path) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(base + path, {
      redirect: "manual",
      signal: ctrl.signal,
      headers: { "User-Agent": "celpare-smoke/1", "Cache-Control": "no-cache" },
    });
  } finally {
    clearTimeout(t);
  }
}

async function attempt() {
  const problems = [];

  let health;
  try {
    const res = await get("/api/health?db=1");
    if (res.status !== 200) problems.push(`/api/health answered ${res.status}`);
    health = await res.json().catch(() => null);
  } catch (e) {
    problems.push(`/api/health unreachable (${e.name})`);
  }
  if (health) {
    if (health.status !== "ok") problems.push(`health status ${health.status}`);
    if (health.db !== "ok") problems.push(`database ${health.db}`);
    if (expected && health.commit !== expected) {
      problems.push(`live commit ${health.commit}, expected ${expected}`);
    }
  }

  for (const path of PAGES) {
    try {
      const res = await get(path);
      if (res.status !== 200) problems.push(`${path} answered ${res.status}`);
      if (path === "/") {
        for (const h of HEADERS) if (!res.headers.get(h)) problems.push(`missing header ${h}`);
      }
      await res.arrayBuffer().catch(() => {});
    } catch (e) {
      problems.push(`${path} unreachable (${e.name})`);
    }
  }

  return { problems, health };
}

for (let round = 1; round <= WARMUP_ROUNDS; round++) {
  const codes = [];
  for (const path of ["/api/health?db=1", ...PAGES]) {
    try {
      const res = await get(path);
      codes.push(res.status);
      await res.arrayBuffer().catch(() => {});
    } catch {
      codes.push("x");
    }
  }
  const bad = codes.filter((c) => c !== 200).length;
  console.log(`smoke: warm up ${round} of ${WARMUP_ROUNDS}, ${bad} of ${codes.length} not 200 (not judged)`);
  if (round < WARMUP_ROUNDS) await new Promise((r) => setTimeout(r, WARMUP_GAP_S * 1000));
}

for (let i = 0; i < WAITS_S.length; i++) {
  if (WAITS_S[i]) await new Promise((r) => setTimeout(r, WAITS_S[i] * 1000));
  const { problems, health } = await attempt();
  if (!problems.length) {
    console.log(
      `smoke: passed on attempt ${i + 1}. ${base} serves version ${health.version}, commit ${health.commit}; ` +
        `${PAGES.length} pages and ${HEADERS.length} security headers ok.`,
    );
    process.exit(0);
  }
  console.log(`smoke: attempt ${i + 1} of ${WAITS_S.length} failed: ${problems.join("; ")}`);
}

console.error(`smoke: FAILED for ${base}`);
process.exit(1);
