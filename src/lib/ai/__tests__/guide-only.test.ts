import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CODE_NOTICE, OutputFilter, stripCodeBlocks } from "../output-filter";
import { buildChatPrompt, buildResearchPrompt, buildSystemPrompt } from "../prompt";

/* Ask Celpare guides and never writes code (founder 2026-11-04, D232). */

describe("prompts tell every lane to guide, not code", () => {
  const base = { canary: "CANARY-x", docs: [], bio: null, plan: "free" };
  for (const [name, prompt] of [
    ["answer", buildSystemPrompt({ ...base, tools: [], web: [] })],
    ["chat", buildChatPrompt(base)],
    ["research", buildResearchPrompt({ ...base, tools: [], web: [], questions: [], kind: "build" })],
  ] as const) {
    it(name, () => {
      assert.match(prompt, /You guide, you never write code\./);
      assert.match(prompt, /Never write code, code snippets, terminal commands/);
    });
  }
});

describe("the output backstop", () => {
  it("replaces a finished code block with the notice and keeps the text around it", () => {
    const out = stripCodeBlocks("Step 1, install it:\n```bash\nnpm create next-app\n```\nThen open the folder.");
    assert.equal(out, `Step 1, install it:\n${CODE_NOTICE}\nThen open the folder.`);
  });

  it("replaces an unfinished block mid stream, and the prefix never changes", () => {
    const a = stripCodeBlocks("Do this:\n```ts\nconst x =");
    const b = stripCodeBlocks("Do this:\n```ts\nconst x = 1;\nmore();");
    assert.equal(a, `Do this:\n${CODE_NOTICE}`);
    assert.equal(b, a);
  });

  it("replaces command lines, bare or in a list, and leaves English sentences", () => {
    const out = stripCodeBlocks("Steps:\n1. npm i resend\n- git clone the repo\nnpx create-next-app\nGit is a version control system.\n2. Open Cursor.");
    assert.equal(
      out,
      "Steps:\n1. See the official guide for the exact command.\n- See the official guide for the exact command.\nSee the official guide for the exact command.\nGit is a version control system.\n2. Open Cursor.",
    );
  });

  it("replaces inline commands, file paths, env names and SDK calls (the live answer)", () => {
    const live = [
      "Install the SDK: npm install resend",
      "Create a route file under app/api/send-email/route.ts (or .js).",
      "Initialise it with process.env.RESEND_API_KEY.",
      "In the POST handler, call resend.emails.send({ from, to, subject, html }), and return the response.",
    ].join("\n");
    const out = stripCodeBlocks(live);
    for (const leak of ["npm install", "route.ts", "process.env", "emails.send("]) assert.ok(!out.includes(leak), `${leak} in: ${out}`);
    assert.match(out, /Install the SDK: the install step in the official guide/);
  });

  it("keeps links intact, even to a code file", () => {
    const link = "See [the example](https://github.com/resend/resend-examples/blob/main/app/api/send/route.ts) and [docs](https://resend.com/docs/send-with-nextjs).";
    assert.equal(stripCodeBlocks(link), link);
  });

  it("filters inline code the same at any chunk size", () => {
    const text = "First, sign up.\n1. Install the SDK: npm install resend\n2. Call resend.emails.send({ to }) from app/api/send/route.ts with process.env.RESEND_API_KEY.\nThen publish.";
    const whole = stripCodeBlocks(text);
    for (const size of [1, 2, 5, 13, 64]) {
      const f = new OutputFilter("CANARY-x");
      let out = "";
      for (let i = 0; i < text.length; i += size) out += f.push(text.slice(i, i + size));
      out += f.flush();
      assert.equal(out, whole, `chunk ${size}`);
    }
  });

  it("does not touch ordinary sentences, sites or versions", () => {
    const plain = "Go to resend.com, open Settings, then pick a plan. Next.js 15 works. Use Vercel or Netlify.";
    assert.equal(stripCodeBlocks(plain), plain);
  });

  it("leaves inline names in backticks alone", () => {
    assert.equal(stripCodeBlocks("Open `Settings` then pick `Domains`."), "Open `Settings` then pick `Domains`.");
  });

  it("never lets code through the streaming filter, whatever the chunking", () => {
    const text = "Here is how.\n```python\nprint('hello')\nimport os\n```\nDone, now publish it.";
    for (const size of [1, 3, 7, 40]) {
      const f = new OutputFilter("CANARY-x");
      let out = "";
      for (let i = 0; i < text.length; i += size) out += f.push(text.slice(i, i + size));
      out += f.flush();
      assert.ok(!out.includes("print("), `chunk ${size}: ${out}`);
      assert.ok(!out.includes("```"), `chunk ${size}`);
      assert.ok(out.includes(CODE_NOTICE) && out.includes("Done, now publish it."), `chunk ${size}: ${out}`);
    }
  });
});
