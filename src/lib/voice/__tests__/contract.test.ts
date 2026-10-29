import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/*
  Contracts that keep voice search an input method and keep secrets server side.
  Read from the source (and the build, when there is one), because these are
  properties of where code lives and what it imports, not of what it returns.
*/

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("Voice search is an input method, not a search engine", () => {
  const input = read("src/components/search/search-input.tsx");

  it("typed search is still the plain GET form to /search with q", () => {
    assert.match(input, /<form ref=\{formRef\} action="\/search" method="get" role="search"/);
    assert.match(input, /name="q"/);
  });

  it("a spoken query is submitted by the same form, not by its own navigation", () => {
    const fn = input.slice(input.indexOf("function searchSpoken"), input.indexOf("function choose"));
    assert.match(fn, /formRef\.current\?\.requestSubmit\(\)/);
    assert.doesNotMatch(fn, /router\.push|fetch\(/);
  });

  it("no voice code touches search ranking, the AI gateway, or another engine", () => {
    const files = [
      "src/components/search/use-voice-search.ts",
      "src/components/search/voice-panel.tsx",
      ...readdirSync(join(ROOT, "src/lib/voice")).filter((f) => f.endsWith(".ts")).map((f) => `src/lib/voice/${f}`),
    ];
    for (const f of files) {
      const src = read(f);
      assert.doesNotMatch(src, /@\/lib\/(search|ai\/gateway|community|explore|recommend|comments)\b/, f);
    }
  });
});

describe("Secrets stay on the server", () => {
  const clientFiles = [
    "src/components/search/use-voice-search.ts",
    "src/components/search/voice-panel.tsx",
    "src/components/search/search-input.tsx",
    "src/lib/voice/types.ts",
    "src/lib/voice/client/machine.ts",
    "src/lib/voice/client/recorder.ts",
    "src/lib/voice/client/upload.ts",
  ];

  it("client code never imports the config, the providers, the limiter or the handler", () => {
    for (const f of clientFiles) {
      const src = read(f);
      assert.doesNotMatch(src, /voice\/(config|providers|limit|handler)|process\.env/, f);
    }
  });

  it("the route and the limiter are server-only", () => {
    assert.match(read("src/app/api/voice/transcribe/route.ts"), /^import "server-only";/);
    assert.match(read("src/lib/voice/limit.ts"), /^import "server-only";/);
  });

  it("no voice variable is NEXT_PUBLIC_", () => {
    assert.doesNotMatch(read("src/lib/voice/config.ts"), /env\.NEXT_PUBLIC_|env\[["']NEXT_PUBLIC_/);
  });

  /* Only meaningful after `npm run build`; skipped otherwise. */
  const staticDir = join(ROOT, ".next/static");
  it("the built browser bundle carries no credential names or key material", { skip: !existsSync(staticDir) }, () => {
    const needles = ["GOOGLE_SPEECH_CREDENTIALS_JSON", "GOOGLE_APPLICATION_CREDENTIALS", "client_email", "oauth2.googleapis.com/token", "PRIVATE KEY", "chirp_3"];
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith(".js")) {
          const text = readFileSync(p, "utf8");
          for (const n of needles) if (text.includes(n)) hits.push(`${n} in ${p}`);
        }
      }
    };
    walk(staticDir);
    assert.deepEqual(hits, []);
  });
});
