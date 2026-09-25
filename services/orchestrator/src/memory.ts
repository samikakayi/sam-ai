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

export function recall(projectId: string) {
  const project = getProject(projectId);
  if (!project) return { facts: [] as string[], recent: [] as ChatMessage[] };
  return {
    facts: project.facts.slice(-8).map((fact) => fact.text),
    recent: project.messages.slice(-6),
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
