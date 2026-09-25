import assert from "node:assert/strict";
import test from "node:test";
import { rankMemory } from "./memory.js";

test("rankMemory returns facts that share words with the request", () => {
  const ranked = rankMemory(
    ["invoice totals", "tea shop uses rtl", "deploy notes"],
    "rtl tea page",
    2,
  );
  assert.deepEqual(ranked, ["tea shop uses rtl"]);
});

test("rankMemory ignores facts with no shared words", () => {
  assert.deepEqual(rankMemory(["alpha", "beta"], "gamma", 4), []);
});
