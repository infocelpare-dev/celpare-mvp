#!/usr/bin/env node
/*
  Celpare pre-commit security scan.

  Runs over the staged diff before every commit and refuses the commit when it
  finds something that must not reach GitHub.

  What this is honestly good at:
    - Stopping secrets. Keys, tokens, private keys and .env files are matched by
      shape, and shape is reliable. This is the reason the script exists.
    - Stopping a secret key from being exposed to the browser through a
      NEXT_PUBLIC_ name, which is CLAUDE.md rule 4 enforced in code.
    - Noticing code that behaves like a dropper: eval of decoded strings, shell
      pipes into sh, install hooks added to package.json.

  What it is not:
    - An antivirus. It does not scan binaries and has no malware signatures.
    - Proof that a dependency is safe. It flags that dependencies changed; it
      cannot tell you whether the new one is hostile. Read the diff.
    - A defence against someone who knows this file exists. Every rule here is
      a pattern, and patterns can be written around. It catches accidents and
      careless copy-paste, which is what actually happens.

  Two levels. BLOCK stops the commit. WARN prints and lets it through, because a
  rule that cries wolf gets disabled within a week.

  Escape hatch: put a path or "path:rule" line in .security-scan-allow, or add
  the comment "scan-allow" on the offending line. Use it deliberately, not to
  make a red line go away.
*/

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const BLOCK = "block";
const WARN = "warn";

/* Files whose contents are never scanned for code patterns. Lockfiles are
   enormous and machine written, so they would only generate noise. Secrets are
   still checked everywhere, including here. */
const SKIP_CODE_RULES = [
  /^package-lock\.json$/,
  /* Prose that describes a dangerous pattern is not a dangerous pattern. Docs
     still get the secret rules, because a pasted key in a doc is still a leak. */
  /\.mdx?$/i,
  /^\.security-scan-allow$/,
  /^scripts\/security-scan\.mjs$/,
  /^public\//,
  /\.(png|jpe?g|gif|webp|ico|svg|woff2?|ttf|eot|pdf|zip|gz)$/i,
];

const SECRET_RULES = [
  {
    id: "private-key",
    level: BLOCK,
    re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/,
    say: "A private key block.",
  },
  {
    id: "jwt",
    level: BLOCK,
    re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
    say: "A JWT. Supabase service role keys are JWTs and bypass every RLS policy.",
  },
  {
    id: "supabase-secret",
    level: BLOCK,
    re: /\bsb_secret_[A-Za-z0-9_-]{16,}/,
    say: "A Supabase secret key.",
  },
  {
    id: "aws-key",
    level: BLOCK,
    re: /\bAKIA[0-9A-Z]{16}\b/,
    say: "An AWS access key id.",
  },
  {
    id: "google-key",
    level: BLOCK,
    re: /\bAIza[0-9A-Za-z_-]{35}\b/,
    say: "A Google API key.",
  },
  {
    id: "github-token",
    level: BLOCK,
    re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
    say: "A GitHub token.",
  },
  {
    id: "stripe-live",
    level: BLOCK,
    re: /\b(?:sk|rk)_live_[0-9a-zA-Z]{20,}\b/,
    say: "A live Stripe secret key.",
  },
  {
    id: "ai-provider-key",
    level: BLOCK,
    re: /\bsk-(?:ant-)?[A-Za-z0-9_-]{28,}\b/,
    say: "An AI provider API key.",
  },
  {
    id: "slack-token",
    level: BLOCK,
    re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/,
    say: "A Slack token.",
  },
  {
    /*
      A value assigned to a name that says it is a secret. Placeholders and env
      lookups are excluded, otherwise every line of .env.example trips it.
    */
    id: "named-secret",
    level: BLOCK,
    re: /\b[A-Z0-9_]*(?:SECRET|PASSWORD|PASSWD|PRIVATE_KEY|ACCESS_KEY|API_KEY|AUTH_TOKEN)[A-Z0-9_]*\s*[:=]\s*["'`]([^"'`\s]{12,})["'`]/,
    say: "A hard coded value on a name that describes a secret.",
    skip: (m) =>
      /^(your|xxx|placeholder|example|changeme|todo|redacted|<|\$\{|process\.env)/i.test(
        m[1],
      ) || /^[*.•]+$/.test(m[1]),
  },
  {
    /* CLAUDE.md rule 4. NEXT_PUBLIC_ is compiled into the browser bundle. */
    id: "public-secret-name",
    level: BLOCK,
    re: /\bNEXT_PUBLIC_[A-Z0-9_]*(?:SERVICE_ROLE|SECRET|PRIVATE)[A-Z0-9_]*/,
    say: "A NEXT_PUBLIC_ name holding something secret. That value ships to the browser.",
  },
];

const CODE_RULES = [
  {
    id: "eval-decoded",
    level: BLOCK,
    re: /\b(?:eval|new\s+Function)\s*\(\s*(?:atob|Buffer\.from|decodeURIComponent|unescape)\b/,
    say: "Evaluating a decoded string. This is how droppers hide a payload.",
  },
  {
    id: "shell-pipe",
    level: BLOCK,
    re: /\b(?:curl|wget)\b[^\n|]*\|\s*(?:sudo\s+)?(?:ba)?sh\b/,
    say: "Piping a download straight into a shell.",
  },
  {
    id: "install-hook",
    level: BLOCK,
    re: /"(?:pre|post)install"\s*:/,
    say: "An install hook in package.json. These run automatically on npm install.",
  },
  {
    id: "eval",
    level: WARN,
    re: /\b(?:eval|new\s+Function)\s*\(/,
    say: "eval or new Function.",
  },
  {
    id: "child-process",
    level: WARN,
    re: /\b(?:child_process|execSync|spawnSync|execFileSync)\b/,
    say: "Shell execution from application code.",
  },
  {
    id: "blob",
    level: WARN,
    re: /["'`][A-Za-z0-9+/]{300,}={0,2}["'`]/,
    say: "A very long encoded string literal.",
  },
];

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function stagedFiles() {
  return git(["diff", "--cached", "--name-only", "--diff-filter=ACM"])
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/* Only added lines are scanned. Existing code is not this hook's business, and
   scanning it would block every commit that touches an old file. */
function addedLines(file) {
  let diff;
  try {
    diff = git(["diff", "--cached", "--unified=0", "--", file]);
  } catch {
    return [];
  }
  const out = [];
  let line = 0;
  for (const raw of diff.split("\n")) {
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      line = Number(hunk[1]);
      continue;
    }
    if (raw.startsWith("+++") || raw.startsWith("---")) continue;
    if (raw.startsWith("+")) out.push({ n: line++, text: raw.slice(1) });
  }
  return out;
}

function loadAllowList() {
  if (!existsSync(".security-scan-allow")) return new Set();
  return new Set(
    readFileSync(".security-scan-allow", "utf8")
      .split("\n")
      .map((l) => l.replace(/#.*$/, "").trim())
      .filter(Boolean),
  );
}

/*
  History mode. A push publishes every commit, not just the new one, and a
  secret committed once stays in the objects even after a later commit removes
  it. Run this before the first push to a remote, and after rewriting history.

  Secret rules only. Code rules over full history would be noise, and the
  question here is "did a key ever get committed", not "is this code odd".
*/
function scanHistory() {
  const shas = git(["log", "--all", "--format=%H"]).split("\n").filter(Boolean);
  if (shas.length === 0) {
    console.log("security scan: no commits to check.");
    return 0;
  }

  const hits = [];
  for (const sha of shas) {
    const subject = git(["log", "-1", "--format=%s", sha]).trim();
    let patch;
    try {
      patch = git(["show", "--unified=0", "--format=", sha]);
    } catch {
      continue;
    }
    let file = "";
    for (const raw of patch.split("\n")) {
      const head = raw.match(/^\+\+\+ b\/(.+)$/);
      if (head) {
        file = head[1];
        continue;
      }
      if (!raw.startsWith("+") || raw.startsWith("+++")) continue;
      const text = raw.slice(1);
      for (const rule of SECRET_RULES) {
        const m = text.match(rule.re);
        if (!m) continue;
        if (rule.skip && rule.skip(m)) continue;
        hits.push({ sha: sha.slice(0, 7), subject, file, rule: rule.id, say: rule.say });
      }
    }
  }

  /* Committing an env file is worth knowing about even if nothing inside it
     matched a pattern, because the patterns do not cover every key shape. */
  for (const sha of shas) {
    const names = git(["show", "--name-only", "--format=", sha])
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    for (const n of names) {
      if (/(^|\/)\.env/.test(n) && !/\.env\.example$/.test(n)) {
        hits.push({
          sha: sha.slice(0, 7),
          subject: git(["log", "-1", "--format=%s", sha]).trim(),
          file: n,
          rule: "env-file",
          say: "An environment file exists in this commit.",
        });
      }
    }
  }

  console.log(`security scan: checked ${shas.length} commit${shas.length > 1 ? "s" : ""} across all branches.`);
  if (hits.length === 0) {
    console.log("No secrets found in history. Safe to push.");
    return 0;
  }
  for (const h of hits) {
    console.error(`  BLOCK  ${h.sha}  ${h.file}  ${h.rule}  ${h.say}`);
    console.error(`         in commit: ${h.subject}`);
  }
  console.error(
    `\n${hits.length} finding${hits.length > 1 ? "s" : ""} in history. Do not push yet.`,
  );
  console.error(
    "Rotate the key first, it must be assumed burned. Then rewrite history with git filter-repo before the remote ever sees it.",
  );
  return 1;
}

function main() {
  if (process.argv.includes("--history")) return scanHistory();

  const files = stagedFiles();
  if (files.length === 0) {
    console.log("security scan: nothing staged.");
    return 0;
  }

  const allow = loadAllowList();
  const findings = [];
  const add = (level, file, n, rule, detail) =>
    findings.push({ level, file, n, rule, detail });

  for (const file of files) {
    if (allow.has(file)) continue;

    /*
      An env file that is not the template. .env.local holds the real keys, and
      committing it is the single most damaging accident available here.
    */
    if (/(^|\/)\.env/.test(file) && !/\.env\.example$/.test(file)) {
      add(BLOCK, file, 0, "env-file", "An environment file is staged.");
      continue;
    }

    const skipCode = SKIP_CODE_RULES.some((re) => re.test(file));
    const rules = skipCode ? SECRET_RULES : [...SECRET_RULES, ...CODE_RULES];

    for (const { n, text } of addedLines(file)) {
      if (/scan-allow/.test(text)) continue;
      for (const rule of rules) {
        if (allow.has(`${file}:${rule.id}`)) continue;
        const m = text.match(rule.re);
        if (!m) continue;
        if (rule.skip && rule.skip(m)) continue;
        add(rule.level, file, n, rule.id, rule.say);
      }
    }
  }

  /* Dependency changes are reported, never blocked. The point is to make you
     look, since a malicious package is the realistic supply chain risk and no
     pattern in this file would catch one. */
  if (files.includes("package.json")) {
    const added = addedLines("package.json").filter((l) =>
      /^\s*"[^"]+"\s*:\s*"[\^~]?\d/.test(l.text),
    );
    if (added.length) {
      console.log(
        `\n  dependencies changed (${added.length} line${added.length > 1 ? "s" : ""}). Read the diff and confirm you meant to add each one:`,
      );
      for (const l of added) console.log(`    ${l.text.trim()}`);
    }
  }

  const blockers = findings.filter((f) => f.level === BLOCK);
  const warnings = findings.filter((f) => f.level === WARN);

  for (const f of warnings) {
    console.log(`  warn   ${f.file}:${f.n}  ${f.rule}  ${f.detail}`);
  }
  for (const f of blockers) {
    console.error(`  BLOCK  ${f.file}:${f.n}  ${f.rule}  ${f.detail}`);
  }

  if (blockers.length) {
    console.error(
      `\nsecurity scan: commit refused, ${blockers.length} blocking finding${blockers.length > 1 ? "s" : ""}.`,
    );
    console.error(
      "Remove the value, or if it is genuinely safe add the line to .security-scan-allow.",
    );
    console.error(
      "If a secret was already committed once, rotate it. Removing it from the file does not remove it from history.",
    );
    return 1;
  }

  console.log(
    `security scan: ${files.length} file${files.length > 1 ? "s" : ""} checked, ${warnings.length} warning${warnings.length === 1 ? "" : "s"}, nothing blocking.`,
  );
  return 0;
}

process.exit(main());
