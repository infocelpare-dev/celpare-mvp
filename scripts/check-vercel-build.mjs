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
  4. Files a function borrows from the project (filePathMap in .vc-config.json:
     .next chunks, node_modules). `vercel deploy --prebuilt` uploads them from
     the working tree, so they ship as much as the output does. Each one must
     exist, stay inside the project and never be an .env file. The compiled
     .next ones get the secret scan of rule 1 (node_modules comes from the
     lockfile and holds test fixtures that look like keys). Their sizes count
     toward the function guard.

  --list <file> writes every borrowed path, one per line, so CI can pack them
  with the output: the deploy job then ships exactly the tested files.

  No dependencies, no child_process. Exit 1 on any failure. Prints names and
  paths only, never a value.
*/
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from "node:fs";
import { join, relative, basename, isAbsolute, normalize } from "node:path";
import { createHash } from "node:crypto";

const args = process.argv.slice(2);
const listAt = args.indexOf("--list");
const LIST = listAt >= 0 ? args[listAt + 1] : null;
if (listAt >= 0) args.splice(listAt, 2);
const OUT = args[0] ?? join(".vercel", "output");
const FUNCTION_LIMIT_MIB = 200;
const TEXT = /\.(js|mjs|cjs|html|json|txt|map|rsc|css|body|meta)$/;

const failures = [];
const notes = [];
const borrowedBy = new Map(); // function -> project paths from filePathMap

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
/*
  Invented values the app ships on purpose, by SHA-256 so the literal is not
  repeated here. Only an exact match is skipped; any other string of the same
  shape still fails.
  - src/lib/ai/providers/mock.ts `__leak_key`: an sk-proj- shape never issued
    by anyone, emitted by the mock AI provider so the output filter is tested
    against the real pattern. The mock provider is imported statically, so the
    string sits in a server chunk even though AI_PROVIDER=mock never runs live.
*/
const KNOWN_FAKES = new Set(["e9ceb72986c7e1143bf0c899abe168364eb9d84069a42bdab86a628327387b4f"]);
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
function hasRealShape(shape, text) {
  const re = new RegExp(shape.re.source, shape.re.flags.includes("g") ? shape.re.flags : shape.re.flags + "g");
  for (const m of text.matchAll(re)) {
    if (!KNOWN_FAKES.has(sha256(m[0]))) return true;
  }
  return false;
}

const JWT_RE =/\beyJ[A-Za-z0-9_-]{8,}\.([A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}/g;

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
    if (hasRealShape(s, text)) failures.push(`${rel}: looks like a ${s.name}.`);
  }
  for (const m of text.matchAll(JWT_RE)) {
    if (isServiceRoleJwt(m[1])) failures.push(`${rel}: a service_role JWT.`);
  }
  if (rel.endsWith(".vc-config.json")) {
    try {
      const config = JSON.parse(text);
      const env = config.environment ?? {};
      const bad = Object.keys(env).filter((k) => !k.startsWith("NEXT_PUBLIC_"));
      if (bad.length) failures.push(`${rel}: build time environment holds server keys: ${bad.join(", ")}.`);
      const func = rel.replace(/[\\/]\.vc-config\.json$/, "").replace(/^functions[\\/]/, "");
      borrowedBy.set(func, Object.values(config.filePathMap ?? {}));
    } catch {
      failures.push(`${rel}: could not read the function config.`);
    }
  }
}
notes.push(`secrets: ${scanned} text files checked`);

// Rule 4: files the functions borrow from the project.
const borrowed = new Map(); // path -> size
for (const [func, paths] of borrowedBy) {
  for (const p of paths) {
    const clean = normalize(p);
    if (isAbsolute(clean) || clean.startsWith("..")) {
      failures.push(`${func}: borrows ${p}, outside the project.`);
      continue;
    }
    if (/^\.env/.test(basename(clean))) {
      failures.push(`${func}: borrows ${p}, an environment file.`);
      continue;
    }
    if (borrowed.has(p)) continue;
    if (!existsSync(p)) {
      failures.push(`${func}: borrows ${p}, which does not exist here.`);
      continue;
    }
    borrowed.set(p, statSync(p).size);
  }
}
let borrowedScanned = 0;
for (const [p, size] of borrowed) {
  if (p.startsWith("node_modules/") || !TEXT.test(p) || size > 50 * 1024 * 1024) continue;
  const text = readFileSync(p, "utf8");
  borrowedScanned++;
  for (const s of SHAPES) {
    if (hasRealShape(s, text)) failures.push(`${p} (borrowed): looks like a ${s.name}.`);
  }
  for (const m of text.matchAll(JWT_RE)) {
    if (isServiceRoleJwt(m[1])) failures.push(`${p} (borrowed): a service_role JWT.`);
  }
}
notes.push(`borrowed: ${borrowed.size} files from the project, ${borrowedScanned} compiled files checked for secrets`);
if (LIST) {
  writeFileSync(LIST, [...borrowed.keys()].sort().join("\n") + "\n");
  notes.push(`borrowed list written to ${LIST}`);
}

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
  for (const [func, paths] of borrowedBy) {
    const extra = [...new Set(paths)].reduce((n, p) => n + (borrowed.get(p) ?? 0), 0);
    funcs.set(func, (funcs.get(func) ?? 0) + extra);
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
