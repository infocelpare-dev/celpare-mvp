import { test } from "node:test";
import assert from "node:assert/strict";
import { CEILING_DEFAULTS, ceilingEnvName, ceilingFor } from "../ceiling-config";

test("defaults apply when nothing is set", () => {
  assert.equal(ceilingFor("ai_message", {}), CEILING_DEFAULTS.ai_message);
  assert.equal(ceilingFor("web_search", {}), CEILING_DEFAULTS.web_search);
  assert.equal(ceilingFor("voice", {}), CEILING_DEFAULTS.voice);
});

test("the env name is predictable", () => {
  assert.equal(ceilingEnvName("web_search"), "CEILING_WEB_SEARCH_PER_DAY");
});

test("a whole number overrides the default, and 0 turns the feature off", () => {
  assert.equal(ceilingFor("voice", { CEILING_VOICE_PER_DAY: " 50 " }), 50);
  assert.equal(ceilingFor("voice", { CEILING_VOICE_PER_DAY: "0" }), 0);
});

test("anything that is not a whole number keeps the default", () => {
  for (const bad of ["", "abc", "-5", "1.5", "1e9"]) {
    assert.equal(ceilingFor("ai_message", { CEILING_AI_MESSAGE_PER_DAY: bad }), CEILING_DEFAULTS.ai_message);
  }
});
