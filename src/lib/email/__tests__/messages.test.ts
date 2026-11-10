import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { escapeHtml, renderEmail } from "../layout";
import {
  billingActivatedEmail,
  billingAlertEmail,
  demoEmail,
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

describe("demo", () => {
  it("sends the places to try, and a video only when one is set", () => {
    const plain = demoEmail();
    assert.equal(plain.kind, "demo");
    assert.equal(plain.subject, "Your Celpare demo");
    for (const path of ["/ask", "/compare", "/explore", "/help", "/startups", "/get-started"]) {
      assert.ok(plain.html.includes(`${path}"`), path);
      assert.ok(plain.text.includes(path), path);
    }
    assert.ok(!plain.text.includes("Watch the demo"));
    assert.ok(!demoEmail("javascript:alert(1)").html.includes("javascript:"));
    const withVideo = demoEmail("https://youtu.be/x");
    assert.ok(withVideo.html.includes('href="https://youtu.be/x"'));
    assert.ok(withVideo.text.includes("Watch the demo: https://youtu.be/x"));
  });
});

describe("billing (phase CRYPTO)", () => {
  const input = { plan: "Pro", period: "Monthly", amount: "$7.99", invoiceNumber: "CP-2026-0001", endsOn: "7 December 2026" };

  it("says it was paid in USDT, never asks for wallet keys or card details, and names the end date", () => {
    const e = billingActivatedEmail(input);
    assert.equal(e.kind, "billing");
    assert.match(e.text, /USDT/);
    assert.match(e.text, /never asks for card details, wallet keys, seed phrases/);
    assert.match(e.text, /7 December 2026/);
    assert.match(e.text, /CP-2026-0001/);
    assert.match(e.text, /renews automatically/);
    assert.doesNotMatch(e.text, /Payoneer/);
  });

  it("keeps every subject on one line", () => {
    const weird = { ...input, plan: "Pro\r\nBcc: x@y.z" };
    assert.doesNotMatch(billingActivatedEmail(weird).subject, /[\r\n]/);
    const alert = billingAlertEmail({ ...weird, event: "paid", billingName: "A", billingEmail: "a@example.com", country: "KE", requestId: "abc" });
    assert.doesNotMatch(alert.subject, /[\r\n]/);
  });

  it("alerts billing@ per event, with the payment and a link to the request", () => {
    const base = { ...input, billingName: "A <b>", billingEmail: "a@example.com", country: "KE", requestId: "abc", paymentId: "123", paid: "7.99 USDTTRC20" };
    const paid = billingAlertEmail({ ...base, event: "paid" });
    assert.equal(paid.kind, "billing_alert");
    assert.match(paid.subject, /^Paid: /);
    assert.match(paid.html, /\/admin\/billing\/abc/);
    assert.match(paid.text, /7\.99 USDTTRC20/);
    assert.doesNotMatch(paid.html, /<b>/);
    assert.match(billingAlertEmail({ ...base, event: "partial" }).text, /Nothing was switched on/);
    assert.match(billingAlertEmail({ ...base, event: "mismatch" }).subject, /^Check payment: /);
    assert.match(billingAlertEmail({ ...base, event: "refunded" }).subject, /^Refunded: /);
  });
});
