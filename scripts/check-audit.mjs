#!/usr/bin/env node
/*
  The production dependency audit, with written, expiring exceptions.

  Runs `npm audit --omit=dev --json` and fails on any high or critical
  advisory unless .audit-allow.json lists that advisory, for that package,
  with a reason and an expiry date that has not passed. An exception that has
  expired fails the build again, so nothing is accepted for good by
  forgetting it. Moderate and low findings are Dependabot's job, as before.

  Added 2026-11-18 for GHSA-fc5q-39xc-vjpf (picomatch), which every published
  version is affected by, so there is nothing to upgrade to yet.
*/
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

const BLOCKING = new Set(["high", "critical"]);

let report;
try {
  report = JSON.parse(execSync("npm audit --omit=dev --json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
} catch (err) {
  /* npm audit exits non zero when it finds anything; the JSON is still on stdout. */
  if (err.stdout) report = JSON.parse(err.stdout);
  else throw err;
}

const allow = existsSync(".audit-allow.json") ? JSON.parse(readFileSync(".audit-allow.json", "utf8")) : [];
const today = new Date().toISOString().slice(0, 10);

const failures = [];
const accepted = [];
for (const [pkg, vuln] of Object.entries(report.vulnerabilities ?? {})) {
  /* Only advisories that sit on this package itself; the packages that merely
     depend on it are reported through it. */
  const advisories = vuln.via.filter((v) => typeof v === "object" && BLOCKING.has(v.severity));
  for (const adv of advisories) {
    const id = String(adv.url ?? "").split("/").pop();
    const rule = allow.find((a) => a.id === id && a.package === pkg);
    if (!rule) {
      failures.push(`${pkg}: ${id} (${adv.severity}) ${adv.title}`);
    } else if (!rule.expires || rule.expires < today) {
      failures.push(`${pkg}: ${id} exception expired on ${rule.expires}; review it again`);
    } else {
      accepted.push(`${pkg}: ${id} accepted until ${rule.expires}. ${rule.reason}`);
    }
  }
}

for (const line of accepted) console.log(`accepted  ${line}`);
if (failures.length > 0) {
  for (const line of failures) console.error(`blocking  ${line}`);
  console.error(`\naudit: ${failures.length} high or critical advisor${failures.length === 1 ? "y" : "ies"} in production dependencies.`);
  process.exit(1);
}
console.log("audit: no blocking advisories in production dependencies.");
