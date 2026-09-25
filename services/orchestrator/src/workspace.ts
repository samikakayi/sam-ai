import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export type ListedFile = { path: string; bytes: number };

const defaultRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "data",
  "workspaces",
);

function rootDir() {
  return process.env.SAM_WORKSPACE_ROOT?.trim() || defaultRoot;
}

function projectDir(projectId: string) {
  if (!/^[a-zA-Z0-9-]+$/.test(projectId)) {
    throw new Error("Invalid project id");
  }
  return join(rootDir(), projectId);
}

export function resolveInside(projectId: string, relativePath: string) {
  const parts = relativePath.split(/[/\\]/).filter(Boolean);
  if (parts.length === 0 || parts.includes("..") || parts[0]?.includes(":")) {
    throw new Error("Path escapes the workspace");
  }
  const rel = normalize(parts.join("/"));
  const root = resolve(projectDir(projectId));
  const target = resolve(root, rel);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error("Path escapes the workspace");
  }
  if (target.split(sep).includes(".git")) {
    throw new Error("Git metadata is not a workspace file");
  }
  return target;
}

function gitEnv() {
  return {
    ...process.env,
    GIT_AUTHOR_NAME: "SAM AI",
    GIT_AUTHOR_EMAIL: "sam@localhost",
    GIT_COMMITTER_NAME: "SAM AI",
    GIT_COMMITTER_EMAIL: "sam@localhost",
  };
}

function git(projectId: string, args: string[]) {
  return execFileSync("git", args, {
    cwd: projectDir(projectId),
    encoding: "utf8",
    env: gitEnv(),
    timeout: 20_000,
  });
}

export function ensureWorkspace(projectId: string) {
  const dir = projectDir(projectId);
  mkdirSync(dir, { recursive: true });
  if (!existsSync(join(dir, ".git"))) {
    git(projectId, ["init"]);
    writeFileSync(join(dir, ".gitignore"), "node_modules\n.DS_Store\n");
  }
  return dir;
}

export function writeWorkspaceFile(projectId: string, relativePath: string, content: string) {
  ensureWorkspace(projectId);
  const target = resolveInside(projectId, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

export function readWorkspaceFile(projectId: string, relativePath: string) {
  const target = resolveInside(projectId, relativePath);
  if (!existsSync(target) || !statSync(target).isFile()) {
    throw new Error("File not found");
  }
  return readFileSync(target);
}

export function readWorkspaceText(projectId: string, relativePath: string) {
  const bytes = readWorkspaceFile(projectId, relativePath);
  if (bytes.includes(0)) return "[binary file]";
  return bytes.subarray(0, 100_000).toString("utf8");
}

function walk(dir: string, base: string, into: ListedFile[]) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (name === ".git" || name === "node_modules") continue;
    const abs = join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    const info = statSync(abs);
    if (info.isDirectory()) walk(abs, rel, into);
    else into.push({ path: rel.replaceAll("\\", "/"), bytes: info.size });
  }
}

export function listWorkspace(projectId: string): ListedFile[] {
  ensureWorkspace(projectId);
  const files: ListedFile[] = [];
  walk(projectDir(projectId), "", files);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export function commitWorkspace(projectId: string, message: string) {
  ensureWorkspace(projectId);
  git(projectId, ["add", "-A"]);
  const staged = git(projectId, ["diff", "--cached", "--name-only"]).trim();
  if (!staged) return false;
  const subject = message.replace(/[\r\n]+/g, " ").slice(0, 120) || "Update workspace";
  git(projectId, ["commit", "-m", subject]);
  return true;
}

export function workspaceDiff(projectId: string) {
  ensureWorkspace(projectId);
  try {
    const patch = git(projectId, ["show", "-p", "--format=fuller", "--stat", "HEAD"]);
    return patch.slice(0, 20_000);
  } catch {
    return "";
  }
}

export function workspaceSnapshot(projectId: string) {
  const files = listWorkspace(projectId);
  const hasPage = files.some((file) => file.path === "index.html");
  const build = hasPage
    ? "Static site ready"
    : files.length > 0
      ? "Sources ready"
      : "Empty workspace";
  return {
    files,
    diff: workspaceDiff(projectId),
    previewPath: hasPage ? `/preview/${projectId}/index.html?v=${Date.now()}` : "",
    build,
    deploy: "No deploy host configured",
  };
}

export function verifyWorkspace(projectId: string) {
  const files = listWorkspace(projectId);
  const html = files.filter((file) => file.path.endsWith(".html"));
  for (const file of html) {
    const text = readWorkspaceText(projectId, file.path);
    if (!/<!doctype html|<html/i.test(text)) {
      return { ok: false, note: `${file.path} is not an HTML document` };
    }
  }
  if (html.length > 0) return { ok: true, note: `Checked ${html.length} HTML file(s)` };
  if (files.length > 0) return { ok: true, note: `Workspace has ${files.length} file(s)` };
  return { ok: true, note: "Workspace is empty" };
}

export function contentType(relativePath: string) {
  const path = relativePath.toLowerCase();
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".json")) return "application/json; charset=utf-8";
  if (path.endsWith(".png")) return "image/png";
  return "text/plain; charset=utf-8";
}
