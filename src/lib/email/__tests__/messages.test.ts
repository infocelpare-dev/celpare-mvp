import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { escapeHtml, renderEmail } from "../layout";
import {
  describeBrowser,
  maskIp,
  newFollowerEmail,
  newLoginEmail,
  reportEmail,
  toolDecisionEmail,
  toolSubmittedEmail,
  welcomeEmail,
} from "../messages";

describe("layout", () => {
  it("escapes every dynamic value", () => {
    assert.equal(escapeHtml(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
    const { html, text } = renderEmail({
      heading: "<script>",
      paragraphs: ["a <b>"],
      details: [{ label: "Note", value: "<img onerror=x>" }],
    });
    assert.ok(!html.includes("<script>"));
    assert.ok(!html.includes("<img"));
    assert.ok(text.includes("<img onerror=x>"), "plain text keeps the words as written");
  });
});

describe("reports", () => {
  it("names the reason, never a reporter, and links the queue", () => {
    const e = reportEmail({
      entityType: "post",
      entityId: "11111111-1111-4111-8111-111111111111",
      reason: "harassment",
      note: "line one\n<b>two</b>",
      itemPath: "/community/1",
      at: new Date("2026-09-30T12:00:00Z"),
    });
    assert.equal(e.kind, "report");
    assert.equal(e.subject, "New report: Harassment on a post");
    assert.ok(e.html.includes("/admin/reports"));
    assert.ok(!/reporter/i.test(e.text));
    assert.ok(!e.html.includes("<b>two</b>"));
  });
});

describe("submissions", () => {
  it("keeps subjects on one line", () => {
    const e = toolSubmittedEmail("tool", "Evil\r\nBcc: x@y.z");
    assert.ok(!/[\r\n]/.test(e.subject));
  });

  it("sends a decision email for each decision except restore", () => {
    for (const d of ["approve", "reject", "request_changes", "suspend"] as const) {
      const e = toolDecisionEmail("tool", "Cursor", d, "Needs a logo", "/tools/cursor");
      assert.ok(e, d);
      assert.equal(e.kind, "tool_decision");
    }
    assert.equal(toolDecisionEmail("tool", "Cursor", "restore", null, null), null);
    const rejected = toolDecisionEmail("model", "M", "reject", "No docs", null)!;
    assert.ok(rejected.text.includes("No docs"));
  });
});

describe("account", () => {
  it("welcomes by first name, or without one", () => {
    assert.equal(welcomeEmail("Ana Lopez").subject, "Welcome to Celpare");
    assert.ok(welcomeEmail("Ana Lopez").text.startsWith("Welcome to Celpare, Ana"));
    assert.ok(welcomeEmail(null).text.startsWith("Welcome to Celpare\n"));
  });

  it("describes a browser without a parser", () => {
    const chromeWin =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
    const edge = `${chromeWin} Edg/140.0`;
    const iphone =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
    assert.equal(describeBrowser(chromeWin), "Chrome on Windows");
    assert.equal(describeBrowser(edge), "Edge on Windows");
    assert.equal(describeBrowser(iphone), "Safari on iOS");
    assert.equal(describeBrowser(null), "Unknown browser");
  });

  it("masks the address to the network", () => {
    assert.equal(maskIp("203.0.113.42"), "203.0.113.x");
    assert.equal(maskIp("2001:db8:85a3:8d3:1319:8a2e:370:7348"), "2001:db8:85a3::x");
    assert.equal(maskIp(null), null);
  });

  it("new login email carries when, browser and network", () => {
    const e = newLoginEmail({ at: new Date("2026-09-30T12:00:00Z"), browser: "Chrome on Windows", ip: "203.0.113.x" });
    assert.equal(e.kind, "new_login");
    assert.ok(e.text.includes("2026-09-30 12:00 UTC"));
    assert.ok(e.text.includes("Chrome on Windows"));
    assert.ok(e.text.includes("203.0.113.x"));
  });
});

describe("community", () => {
  it("names the follower, or falls back", () => {
    assert.equal(newFollowerEmail({ name: "Sam", username: "sam" }).subject, "Sam followed you on Celpare");
    assert.equal(newFollowerEmail({ name: null, username: "sam" }).subject, "@sam followed you on Celpare");
    assert.equal(newFollowerEmail({ name: null, username: null }).subject, "Someone followed you on Celpare");
  });
});
