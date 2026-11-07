/*
  Celpare commit message check (phase OPS, step 2).

    node scripts/check-commit-msg.mjs <message-file>      git commit-msg hook
    git log --format='%an%x1f%B%x1e' A..B | \
      node scripts/check-commit-msg.mjs --stdin            every commit in a PR
    PR_TITLE="..." node scripts/check-commit-msg.mjs --title   the PR title

  The header is a Conventional Commit, because release-please reads it to pick
  the next version: feat is a minor, fix a patch, ! or BREAKING CHANGE a major
  (a minor while below 1.0.0). After the prefix the founder's plain sentence
  stays: "feat(onboarding): Let people edit their interests".

  Two house rules apply to every human written message:
  - No em dashes (CLAUDE.md rule 1).
  - No Co-Authored-By trailer: commits list the founder only.

  Bot commits (author ending in [bot], e.g. Dependabot) are checked for the
  prefix only. Their bodies quote upstream changelogs, which are not ours to
  rewrite.

  Merge commits, git's own Revert "..." and fixup!/squash!/amend! are allowed
  as git writes them.

  No dependencies, no child_process. Exit 1 on any failure.
*/
import { readFileSync } from "node:fs";

const TYPES = ["feat", "fix", "perf", "refactor", "docs", "style", "test", "build", "ci", "chore", "revert", "deps"];
const HEADER = new RegExp(`^(${TYPES.join("|")})(\\([a-z0-9._/-]+\\))?!?: \\S`);
const PASS_THROUGH = [/^Merge /, /^Revert "/, /^(fixup|squash|amend)! /];
const MAX_HEADER = 100;
const EM_DASH = "—";
const CO_AUTHOR = /^co-authored-by:/im;

/* Drop git's comment lines and everything under the scissors line. */
function clean(message) {
  const cut = message.split(/^# -+ >8 -+$/m)[0];
  return cut
    .split(/\r?\n/)
    .filter((l) => !l.startsWith("#"))
    .join("\n")
    .trim();
}

function check(message, { author = "", headerOnly = false } = {}) {
  const errors = [];
  const text = clean(message);
  if (!text) return ["The message is empty."];
  const header = text.split("\n")[0].trim();
  const bot = /\[bot\]$/.test(author.trim());

  if (!PASS_THROUGH.some((re) => re.test(header))) {
    if (!HEADER.test(header)) {
      errors.push(
        `Header must start with a type: ${TYPES.join(", ")}. ` +
          'Example: "feat(onboarding): Let people edit their interests". ' +
          `Got: "${header.slice(0, 80)}"`,
      );
    }
    if (header.length > MAX_HEADER) errors.push(`Header is ${header.length} characters; keep it to ${MAX_HEADER}.`);
  }

  if (!bot && !headerOnly) {
    if (text.includes(EM_DASH)) errors.push("Contains an em dash. Use a comma, colon or period.");
    if (CO_AUTHOR.test(text)) errors.push("Contains a Co-Authored-By trailer. Commits list the founder only.");
  } else if (headerOnly && text.includes(EM_DASH)) {
    errors.push("Contains an em dash. Use a comma, colon or period.");
  }
  return errors;
}

function report(label, errors) {
  for (const e of errors) console.error(`FAIL ${label}: ${e}`);
  return errors.length;
}

const arg = process.argv[2];
let failed = 0;

if (arg === "--stdin") {
  let raw = "";
  try {
    raw = readFileSync(0, "utf8");
  } catch {
    raw = "";
  }
  const records = raw.split("\x1e").map((r) => r.replace(/^\s+/, "")).filter((r) => r.trim());
  for (const rec of records) {
    const [author, body = ""] = rec.split("\x1f");
    const header = clean(body).split("\n")[0];
    failed += report(`commit "${header.slice(0, 60)}"`, check(body, { author }));
  }
  if (!failed) console.log(`commit message check: ${records.length} commit(s) passed`);
} else if (arg === "--title") {
  const title = process.env.PR_TITLE ?? "";
  failed += report("PR title", check(title, { headerOnly: true }));
  if (!failed) console.log("PR title check: passed");
} else if (arg) {
  failed += report("commit message", check(readFileSync(arg, "utf8")));
} else {
  console.error("Usage: check-commit-msg.mjs <file> | --stdin | --title");
  process.exit(2);
}

process.exit(failed ? 1 : 0);
