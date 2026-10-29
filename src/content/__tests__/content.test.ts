import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { LEGAL_DOCS } from "../legal/index";
import { HELP_DOCS } from "../help/index";
import { EXPORT_TABLES, ASK_MESSAGE_SELECT, FORBIDDEN_COLUMNS } from "../../lib/account/export-spec";
import type { Block, Doc } from "../types";

/*
  The legal and help pages (phase LEGAL, 2026-10-07): no em or en dashes (hard
  rule 1), unique anchors, every internal link resolves to a page or document
  that exists, and Download my data never exports the Ask model (D64).
*/

const ALL: Doc[] = [...LEGAL_DOCS, ...HELP_DOCS];

function texts(doc: Doc): string[] {
  const out = [doc.title, doc.description, ...(doc.summary ?? [])];
  const block = (b: Block) => {
    if (typeof b === "string") out.push(b);
    else if ("list" in b) out.push(...b.list);
    else if ("steps" in b) out.push(...b.steps);
    else if ("note" in b) out.push(b.note);
    else out.push(...b.table.head, ...b.table.rows.flat());
  };
  for (const s of doc.sections) {
    out.push(s.heading);
    s.blocks.forEach(block);
  }
  for (const c of doc.changes ?? []) out.push(c.note);
  return out;
}

/* App routes on disk, as URL paths: src/app/foo/page.tsx is /foo. */
function appRoutes(): Set<string> {
  const root = join(process.cwd(), "src", "app");
  const found = new Set<string>();
  const walk = (dir: string, url: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const seg = e.name.startsWith("(") ? "" : `/${e.name}`;
      const next = join(dir, e.name);
      if (existsSync(join(next, "page.tsx"))) found.add(url + seg || "/");
      walk(next, url + seg);
    }
  };
  walk(root, "");
  found.add("/");
  return found;
}

describe("legal and help content", () => {
  it("has no em or en dashes anywhere", () => {
    for (const d of ALL) {
      for (const t of texts(d)) assert.ok(!/[\u2013\u2014]/.test(t), `${d.slug}: ${t.slice(0, 80)}`);
    }
  });

  it("has unique slugs and unique section ids per document", () => {
    assert.equal(new Set(LEGAL_DOCS.map((d) => d.slug)).size, LEGAL_DOCS.length);
    assert.equal(new Set(HELP_DOCS.map((d) => d.slug)).size, HELP_DOCS.length);
    for (const d of ALL) {
      const ids = d.sections.map((s) => s.id);
      assert.equal(new Set(ids).size, ids.length, d.slug);
    }
  });

  it("links only to pages and anchors that exist", () => {
    const routes = appRoutes();
    const docs = new Map<string, Doc>([
      ...LEGAL_DOCS.map((d) => [`/legal/${d.slug}`, d] as const),
      ...HELP_DOCS.map((d) => [`/help/${d.slug}`, d] as const),
    ]);
    for (const d of ALL) {
      for (const t of texts(d)) {
        for (const m of t.matchAll(/\]\((\/[^)#\s]*)(?:#([\w-]+))?\)/g)) {
          const [, path, anchor] = m;
          const doc = docs.get(path);
          if (doc) {
            if (anchor) assert.ok(doc.sections.some((s) => s.id === anchor), `${d.slug} -> ${path}#${anchor}`);
            continue;
          }
          assert.ok(routes.has(path), `${d.slug} links to ${path}, which is not a page`);
        }
      }
    }
  });

  it("keeps placeholders out of the documents themselves", () => {
    /* They belong in operator.ts only, so filling them there fills every page. */
    for (const d of ALL) {
      for (const t of texts(d)) {
        const stripped = t.replace(/\[FOUNDER LEGAL NAME\]|\[POSTAL ADDRESS\]/g, "");
        assert.ok(!/\[[A-Z][A-Z ]{3,}\]/.test(stripped), `${d.slug}: ${t.slice(0, 80)}`);
      }
    }
  });
});

describe("Download my data", () => {
  it("never selects the Ask model or provider", () => {
    for (const col of FORBIDDEN_COLUMNS) {
      assert.ok(!ASK_MESSAGE_SELECT.split(",").includes(col));
      const usage = EXPORT_TABLES.find((t) => t.table === "ai_usage_records");
      assert.ok(usage && !usage.select.split(",").includes(col));
    }
    const conv = EXPORT_TABLES.find((t) => t.table === "conversations");
    assert.ok(conv, "conversations exported");
  });

  it("filters every table on a user column", () => {
    for (const t of EXPORT_TABLES) assert.ok(t.column.length > 0, t.key);
    assert.equal(new Set(EXPORT_TABLES.map((t) => t.key)).size, EXPORT_TABLES.length);
  });
});
