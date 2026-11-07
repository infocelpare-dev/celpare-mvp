/*
  Celpare migration safety check (phase OPS). CI pipes the changed migration
  files into it:

    git diff --name-status --no-renames <base> HEAD -- supabase/migrations \
      | node scripts/check-migrations.mjs

  Why it exists. An app rollback swaps code only (D15, Workers versions). The
  database stays where it is, so every migration must leave the previous app
  version working, and none may destroy data on its own. Expand and contract:
  add first, ship the code, remove later in a separate reviewed change.

  Rules for an added migration:
  - The filename is <14 digit version>_<snake_case_name>.sql, the shape
    Supabase records in supabase_migrations.schema_migrations.
  - Its version is newer than the history imported in OPS step 6.
  - It contains none of the statements below, unless the file carries
    `-- celpare:destructive-approved <reason>` with a real reason. The marker
    is a decision written down, not a way around the check.

  An applied migration is history: changing or deleting one fails always.

  No dependencies, no child_process. Exit 1 on any failure.
*/
import { readFileSync } from "node:fs";

/* Every migration up to this version was applied before the files were in
   git, and is imported as history in OPS step 6. Older ones contain drops
   that were right at the time; they are not re-judged here. */
const IMPORTED_THROUGH = "20261104090429";

const DESTRUCTIVE = [
  { what: "drop table", re: /\bdrop\s+table\b/i },
  { what: "drop schema", re: /\bdrop\s+schema\b/i },
  { what: "drop column", re: /\bdrop\s+column\b/i },
  { what: "truncate", re: /\btruncate\b/i },
  { what: "column type change", re: /\balter\s+column\s+\S+\s+(?:set\s+data\s+)?type\b/i },
  { what: "rename (the previous app version still uses the old name)", re: /\brename\s+(?:column\s+)?\S+\s+to\b|\brename\s+to\b/i },
  { what: "delete without where", re: /\bdelete\s+from\s+[^;]*?(?:;|$)/i, test: (stmt) => !/\bwhere\b/i.test(stmt) },
];
const MARKER = /--\s*celpare:destructive-approved\s+(\S.{9,})/i;
const NAME = /^supabase\/migrations\/(\d{14})_[a-z0-9_]+\.sql$/;

function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/* Dollar quoted bodies (functions) are kept: a function that drops a table is
   still a function that drops a table. */
function findings(sql) {
  const body = stripComments(sql);
  const out = [];
  for (const rule of DESTRUCTIVE) {
    const re = new RegExp(rule.re.source, rule.re.flags.includes("g") ? rule.re.flags : rule.re.flags + "g");
    for (const m of body.matchAll(re)) {
      if (rule.test && !rule.test(m[0])) continue;
      out.push(rule.what);
      break;
    }
  }
  return out;
}

/* stdin: the git diff --name-status lines. Empty input means no change. */
let raw = "";
try {
  raw = readFileSync(0, "utf8");
} catch {
  raw = "";
}

const lines = raw
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter(Boolean);

const failures = [];
let checked = 0;

for (const line of lines) {
  const [status, file] = line.split(/\s+/);
  const path = (file ?? "").replace(/\\/g, "/");
  if (!path.startsWith("supabase/migrations/")) continue;
  if (!path.endsWith(".sql")) continue;

  const m = NAME.exec(path);

  if (status === "D") {
    failures.push(`${path}: an applied migration was deleted. History stays; write a new migration instead.`);
    continue;
  }
  if (status === "M") {
    if (m && m[1] <= IMPORTED_THROUGH) {
      failures.push(`${path}: an applied migration was changed. Write a new migration instead.`);
      continue;
    }
  }
  if (!m) {
    failures.push(`${path}: name must be <14 digit version>_<snake_case>.sql.`);
    continue;
  }

  /* The history import itself adds every old file once. */
  if (status === "A" && m[1] <= IMPORTED_THROUGH) continue;

  checked++;
  const sql = readFileSync(path, "utf8");
  const found = findings(sql);
  if (found.length && !MARKER.test(sql)) {
    failures.push(
      `${path}: ${found.join(", ")}. Make it expand and contract, or add ` +
        "`-- celpare:destructive-approved <reason>` after a deliberate decision.",
    );
  }
}

if (failures.length) {
  for (const f of failures) console.error(`FAIL ${f}`);
  process.exit(1);
}
console.log(`migration check: ${checked} new or changed migration(s) checked, passed`);
