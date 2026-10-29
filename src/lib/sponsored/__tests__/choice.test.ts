import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { initialChoice, sortChoices, sponsorChoice, type ChoiceTool } from "../choice";

const tool = (over: Partial<ChoiceTool> = {}): ChoiceTool => ({
  slug: "t",
  name: "Tool",
  logoUrl: null,
  status: "approved",
  websiteUrl: "https://example.com",
  ...over,
});
const now = new Date("2026-10-09T00:00:00Z");

describe("sponsorChoice", () => {
  it("allows an approved tool with an https website and nothing running", () => {
    const c = sponsorChoice(tool(), null, now);
    assert.equal(c.eligible, true);
    assert.equal(c.reason, null);
  });

  it("refuses drafts, reviews and rejections with a reason", () => {
    for (const status of ["draft", "pending", "changes_required", "rejected", "weird"]) {
      const c = sponsorChoice(tool({ status }), null, now);
      assert.equal(c.eligible, false, status);
      assert.ok(c.reason && c.reason.length > 0, status);
    }
  });

  it("refuses a missing or plain http website", () => {
    assert.equal(sponsorChoice(tool({ websiteUrl: null }), null, now).eligible, false);
    assert.equal(sponsorChoice(tool({ websiteUrl: "http://example.com" }), null, now).eligible, false);
  });

  it("refuses a tool already sponsored and says until when", () => {
    const c = sponsorChoice(tool(), { status: "active", endsAt: "2026-11-01T00:00:00Z", placementSuspendedAt: null }, now);
    assert.equal(c.eligible, false);
    assert.equal(c.sponsoredUntil, "2026-11-01T00:00:00Z");
  });

  it("allows a tool whose sponsorship has ended", () => {
    const c = sponsorChoice(tool(), { status: "active", endsAt: "2026-10-01T00:00:00Z", placementSuspendedAt: null }, now);
    assert.equal(c.eligible, true);
  });

  it("explains a suspended placement", () => {
    const c = sponsorChoice(tool(), { status: "active", endsAt: null, placementSuspendedAt: "2026-10-05T00:00:00Z" }, now);
    assert.equal(c.eligible, false);
    assert.match(c.reason ?? "", /paused/);
  });
});

describe("ordering and the first choice", () => {
  const list = sortChoices([
    sponsorChoice(tool({ slug: "b", name: "Beta", status: "draft" }), null, now),
    sponsorChoice(tool({ slug: "z", name: "Zeta" }), null, now),
    sponsorChoice(tool({ slug: "a", name: "Alpha" }), null, now),
  ]);

  it("puts eligible tools first, by name", () => {
    assert.deepEqual(list.map((c) => c.slug), ["a", "z", "b"]);
  });

  it("starts with the asked for tool only when it can be chosen", () => {
    assert.equal(initialChoice(list, "z"), "z");
    assert.equal(initialChoice(list, "b"), "a");
    assert.equal(initialChoice(list, null), "a");
    assert.equal(initialChoice([], "a"), null);
  });
});
