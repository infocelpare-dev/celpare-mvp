/*
  Celpare Vercel build guard (D253). Run after `vercel build --prod`:

    node scripts/check-vercel-build.mjs [.vercel/output]

  The Vercel successor of check-worker-build.mjs. CI builds with no .env files
  and only public NEXT_PUBLIC_ values, so no server secret may appear anywhere
  in the output: not in the browser assets (static/) and not in the function
  bundles (functions/), which Vercel ships as they are.

  1. Secret shapes in every text file of the output. Matched by shape, not by
     name: supabase-js legitimately contains the string "sb_secret_" in a prefix
     check. A JWT fails only when its payload says role service_role.
  2. No function config carries an environment block with a non NEXT_PUBLIC_
     key. Server secrets reach functions at runtime from the Vercel project,
     never from the build.
  3. Prints the static and function sizes, and fails a single function bundle
     over 200 MiB (Vercel's limit is 250 MB uncompressed).

  No dependencies, no child_process. Exit 1 on any failure. Prints names and
  paths only, never a value.
*/
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const OUT = process.argv[2] ?? join(".vercel", "output");
const FUNCTION_LIMIT_MIB = 200;
const TEXT = /\.(js|mjs|cjs|html|json|txt|map|rsc|css|body|meta)$/;

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

const SHAPES = [
  { name: "Supabase secret key", re: /\bsb_secret_[A-Za-z0-9_-]{16,}/ },
  { name: "provider sk- key", re: /\bsk-(?:or-v1-|ant-|proj-)?[A-Za-z0-9_-]{28,}\b/ },
  { name: "Stripe live key", re: /\b(?:sk|rk)_live_[0-9a-zA-Z]{20,}\b/ },
  { name: "Resend key", re: /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}\b/ },
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

if (!existsSync(OUT)) {
  console.error(`FAIL ${OUT} not found. Run vercel build --prod first.`);
  process.exit(1);
}

const files = walk(OUT);
let scanned = 0;
for (const f of files) {
  if (!TEXT.test(f.path) || f.size > 50 * 1024 * 1024) continue;
  const text = readFileSync(f.path, "utf8");
  scanned++;
  const rel = relative(OUT, f.path);
  for (const s of SHAPES) {
    if (s.re.test(text)) failures.push(`${rel}: looks like a ${s.name}.`);
  }
  for (const m of text.matchAll(JWT_RE)) {
    if (isServiceRoleJwt(m[1])) failures.push(`${rel}: a service_role JWT.`);
  }
  if (rel.endsWith(".vc-config.json")) {
    try {
      const env = JSON.parse(text).environment ?? {};
      const bad = Object.keys(env).filter((k) => !k.startsWith("NEXT_PUBLIC_"));
      if (bad.length) failures.push(`${rel}: build time environment holds server keys: ${bad.join(", ")}.`);
    } catch {
      failures.push(`${rel}: could not read the function config.`);
    }
  }
}
notes.push(`secrets: ${scanned} text files checked`);

const mib = (n) => (n / 1024 / 1024).toFixed(2);
const staticBytes = files.filter((f) => relative(OUT, f.path).startsWith("static")).reduce((n, f) => n + f.size, 0);
notes.push(`static: ${mib(staticBytes)} MiB`);

const funcDir = join(OUT, "functions");
if (existsSync(funcDir)) {
  const funcs = new Map();
  for (const f of files) {
    const rel = relative(funcDir, f.path);
    if (rel.startsWith("..")) continue;
    const m = rel.match(/^(.*?\.func)[\\/]/);
    if (!m) continue;
    funcs.set(m[1], (funcs.get(m[1]) ?? 0) + f.size);
  }
  let biggest = ["", 0];
  for (const [name, bytes] of funcs) {
    if (bytes > biggest[1]) biggest = [name, bytes];
    if (bytes / 1024 / 1024 > FUNCTION_LIMIT_MIB) failures.push(`${name} is ${mib(bytes)} MiB, over the ${FUNCTION_LIMIT_MIB} MiB guard.`);
  }
  notes.push(`functions: ${funcs.size}, largest ${biggest[0] || "none"} ${mib(biggest[1])} MiB (guard ${FUNCTION_LIMIT_MIB} MiB)`);
} else {
  failures.push(`${funcDir} not found: the build produced no functions.`);
}

for (const n of notes) console.log(`ok  ${n}`);
if (failures.length) {
  for (const f of failures) console.error(`FAIL ${f}`);
  process.exit(1);
}
console.log("vercel build guard: passed");
