import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { draftProject, parseFileBlocks } from "./builder.js";
import {
  commitWorkspace,
  listWorkspace,
  readWorkspaceText,
  resolveInside,
  workspaceDiff,
  writeWorkspaceFile,
} from "./workspace.js";

process.env.SAM_WORKSPACE_ROOT = mkdtempSync(join(tmpdir(), "sam-workspace-"));

test("workspace rejects paths that leave the project", () => {
  assert.throws(() => resolveInside("proj", "../store.json"));
  assert.throws(() => resolveInside("proj", ".git/config"));
});

test("writes files, commits them, and exposes a diff", () => {
  const drafts = draftProject({
    projectId: "tea",
    projectName: "Cha",
    text: "وێبسایتێکی سادە بۆ فرۆشتنی چا دروست بکە",
    intent: "build_web",
    kurdish: true,
  });
  for (const file of drafts) writeWorkspaceFile("tea", file.path, file.content);
  assert.equal(commitWorkspace("tea", "Draft the tea shop"), true);
  const files = listWorkspace("tea").map((file) => file.path);
  assert.ok(files.includes("index.html"));
  assert.match(readWorkspaceText("tea", "index.html"), /dir="rtl"/);
  assert.match(workspaceDiff("tea"), /index.html/);
});

test("parses FILE blocks and ignores unsafe paths", () => {
  const files = parseFileBlocks(
    "note\nFILE: src/app.js\n```js\nconsole.log(1)\n```\nFILE: ../secret\n```txt\nno\n```",
  );
  assert.deepEqual(files, [{ path: "src/app.js", content: "console.log(1)" }]);
});
