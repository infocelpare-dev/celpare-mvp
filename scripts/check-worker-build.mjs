/*
  Celpare Worker build guard (phase OPS). Run after `npm run cf:build` and
  `wrangler deploy --dry-run --outdir <dir>`:

    node scripts/check-worker-build.mjs <dry-run-outdir>

  Three checks, each one a way a build could go out wrong:

  1. No server secret compiled into the Worker. The OpenNext adapter copies
     every .env* file it finds into .open-next/cloudflare/next-env.mjs. On the
     founder's machine that file held 15 keys from .env.local, the Supabase
     service role key among them (2026-11-07). CI has no .env files, so only
     NEXT_PUBLIC_ keys may ever appear there. Anything else fails the build.

  2. No secret value in the browser assets. Matched by shape, not by name: the
     supabase-js client legitimately contains the string "sb_secret_" in a
     prefix check, so a name search is a false alarm. A JWT is decoded and fails
     only when its payload says role service_role.

  3. Worker size under the guard line. Cloudflare's cap is 64 MiB uncompressed
     per Worker. Failing at 48 MiB leaves room to see growth coming rather than
     meet it at deploy time. Static assets are not part of that cap.

  No dependencies, no child_process. Exit 1 on any failure.
*/
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const OPEN_NEXT = ".open-next";
const ENV_FILE = join(OPEN_NEXT, "cloudflare", "next-env.mjs");
const ASSETS = join(OPEN_NEXT, "assets");
const LIMIT_MIB = 48;

const failures = [];
const notes = [];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else out.push({ path: p, size: s.size });
  }
  return out;
}

/* 1. Compiled env files. */
if (!existsSync(ENV_FILE)) {
  failures.push(`${ENV_FILE} not found. Run npm run cf:build first.`);
} else {
  const text = readFileSync(ENV_FILE, "utf8");
  const exportRe = /export const (\w+) = (\{.*?\});/g;
  let seen = 0;
  let leaked = false;
  for (const m of text.matchAll(exportRe)) {
    seen++;
    let vars;
    try {
      vars = JSON.parse(m[2]);
    } catch {
      failures.push(`${ENV_FILE}: could not read the ${m[1]} block.`);
      continue;
    }
    const bad = Object.keys(vars).filter((k) => !k.startsWith("NEXT_PUBLIC_"));
    if (bad.length) {
      leaked = true;
      /* Names only. Never print a value. */
      failures.push(
        `${ENV_FILE} (${m[1]}) holds server keys from an .env file: ${bad.join(", ")}. ` +
          "Build in CI with no .env files. Never deploy a local build.",
      );
    }
  }
  if (seen === 0) failures.push(`${ENV_FILE}: no env blocks found, the adapter format changed. Read the file and update this check.`);
  else if (!leaked) notes.push(`env: ${seen} blocks checked, public keys only`);
}

/* 2. Secret shapes in browser assets. */
const SHAPES = [
  { name: "Supabase secret key", re: /\bsb_secret_[A-Za-z0-9_-]{16,}/ },
  { name: "provider sk- key", re: /\bsk-(?:or-v1-|ant-|proj-)?[A-Za-z0-9_-]{28,}\b/ },
  { name: "Stripe live key", re: /\b(?:sk|rk)_live_[0-9a-zA-Z]{20,}\b/ },
  { name: "private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
];
const JWT_RE = /\beyJ[A-Za-z0-9_-]{8,}\.([A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}/g;

function isServiceRoleJwt(payloadPart) {
  try {
    const json = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
    return json && json.role === "service_role";
  } catch {
    return false;
  }
}

if (existsSync(ASSETS)) {
  const files = walk(ASSETS).filter((f) => /\.(js|mjs|html|json|txt|map)$/.test(f.path));
  for (const f of files) {
    const text = readFileSync(f.path, "utf8");
    for (const s of SHAPES) {
      if (s.re.test(text)) failures.push(`${f.path}: looks like a ${s.name} in a browser asset.`);
    }
    for (const m of text.matchAll(JWT_RE)) {
      if (isServiceRoleJwt(m[1])) failures.push(`${f.path}: a service_role JWT in a browser asset.`);
    }
  }
  notes.push(`assets: ${files.length} text files checked for secret shapes`);
} else {
  failures.push(`${ASSETS} not found.`);
}

/* 3. Worker size, from the wrangler dry run output. */
const outdir = process.argv[2];
if (!outdir || !existsSync(outdir)) {
  failures.push("Pass the wrangler --dry-run --outdir directory as the first argument.");
} else {
  const files = walk(outdir).filter((f) => !f.path.endsWith(".map") && !f.path.endsWith("README.md"));
  const bytes = files.reduce((n, f) => n + f.size, 0);
  const mib = bytes / 1024 / 1024;
  notes.push(`worker: ${mib.toFixed(2)} MiB uncompressed (guard ${LIMIT_MIB} MiB, Cloudflare cap 64 MiB)`);
  if (mib > LIMIT_MIB) failures.push(`Worker is ${mib.toFixed(2)} MiB, over the ${LIMIT_MIB} MiB guard.`);
}

for (const n of notes) console.log(`ok  ${n}`);
if (failures.length) {
  for (const f of failures) console.error(`FAIL ${f}`);
  process.exit(1);
}
console.log("worker build guard: passed");
