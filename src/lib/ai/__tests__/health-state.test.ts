import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aiProviderState } from "../../admin/ai-health-state";

describe("aiProviderState", () => {
  it("is unknown with no requests", () => {
    assert.equal(aiProviderState(0, 0), "unknown");
  });

  it("does not call a few retried failures down", () => {
    // The 2026-11-12 case: 3 of 9 failed while Ask was answering.
    assert.equal(aiProviderState(9, 3), "degraded");
    assert.equal(aiProviderState(9, 0), "healthy");
  });

  it("calls it down when every request fails", () => {
    assert.equal(aiProviderState(3, 3), "down");
    assert.equal(aiProviderState(2, 2), "degraded");
  });

  it("uses the rate once there is enough traffic", () => {
    assert.equal(aiProviderState(40, 11), "down");
    assert.equal(aiProviderState(40, 3), "degraded");
    assert.equal(aiProviderState(40, 2), "healthy");
  });
});
