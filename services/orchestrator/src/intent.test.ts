import assert from "node:assert/strict";
import test from "node:test";
import { analyzeIntent } from "./intent.js";

test("Kurdish what-is questions stay explanations", () => {
  assert.equal(analyzeIntent("چا چییە؟").id, "explain");
  assert.equal(analyzeIntent("What is tea?").id, "explain");
});
