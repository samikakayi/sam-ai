import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import type { ChatMessage, Project } from "@sam/protocol";

type Fact = {
  id: string;
  text: string;
  at: string;
};

type ProjectRecord = Project & {
  facts: Fact[];
  messages: ChatMessage[];
};

type Store = {
  projects: ProjectRecord[];
};

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
const storePath = join(dataDir, "store.json");

function emptyStore(): Store {
  return {
    projects: [
      {
        id: "general",
        name: "General",
        createdAt: new Date().toISOString(),
        facts: [],
        messages: [],
      },
    ],
  };
}

function load(): Store {
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8")) as Store;
    if (!Array.isArray(parsed.projects) || parsed.projects.length === 0) {
      return emptyStore();
    }
    return parsed;
  } catch {
    return emptyStore();
  }
}

let store = load();

function save() {
  mkdirSync(dataDir, { recursive: true });
  const tmp = `${storePath}.tmp`;
  writeFileSync(tmp, JSON.stringify(store, null, 2));
  renameSync(tmp, storePath);
}

export function listProjects(): Project[] {
  return store.projects.map(({ id, name, createdAt }) => ({ id, name, createdAt }));
}

export function createProject(name: string): Project {
  const project: ProjectRecord = {
    id: randomUUID(),
    name: name.trim().slice(0, 80) || "Untitled",
    createdAt: new Date().toISOString(),
    facts: [],
    messages: [],
  };
  store.projects.unshift(project);
  save();
  return { id: project.id, name: project.name, createdAt: project.createdAt };
}

export function getProject(id: string) {
  return store.projects.find((project) => project.id === id) ?? null;
}

export function history(projectId: string): ChatMessage[] {
  return getProject(projectId)?.messages ?? [];
}

function tokens(text: string) {
  return new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length > 1),
  );
}

export function rankMemory(facts: string[], query: string, limit = 6) {
  const queryTokens = tokens(query);
  const scored = facts.map((text, index) => {
    const factTokens = tokens(text);
    let score = 0;
    for (const token of queryTokens) {
      if (factTokens.has(token)) score += 1;
    }
    return { text, score, index };
  });
  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.index - a.index)
    .slice(0, limit)
    .map((item) => item.text);
}

export function recall(projectId: string, query = "") {
  const project = getProject(projectId);
  if (!project) {
    return { facts: [] as string[], recent: [] as ChatMessage[], scanned: 0, matched: 0 };
  }
  const all = project.facts.map((fact) => fact.text);
  const matched = query ? rankMemory(all, query, all.length) : all;
  const facts = (matched.length > 0 ? matched : all.slice(-4)).slice(0, 6);
  return {
    facts,
    recent: project.messages.slice(-6),
    scanned: all.length,
    matched: matched.length,
  };
}

export function appendMessage(projectId: string, message: ChatMessage) {
  const project = getProject(projectId);
  if (!project) return;
  project.messages.push(message);
  if (project.messages.length > 200) {
    project.messages.splice(0, project.messages.length - 200);
  }
  save();
}

export function remember(projectId: string, text: string) {
  const project = getProject(projectId);
  if (!project) return;
  project.facts.push({
    id: randomUUID(),
    text: text.slice(0, 500),
    at: new Date().toISOString(),
  });
  if (project.facts.length > 100) {
    project.facts.splice(0, project.facts.length - 100);
  }
  save();
}
