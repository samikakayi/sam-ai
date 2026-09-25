export type AgentId =
  | "researcher"
  | "architect"
  | "coder"
  | "reviewer"
  | "tester"
  | "devops"
  | "memory";

export type AgentStatus = "idle" | "running" | "done" | "blocked";

export type IntentId =
  | "build_web"
  | "build_software"
  | "fix"
  | "research"
  | "deploy"
  | "explain";

export type BrainName = "agents" | "model" | "memory" | "tools";
export type BrainState = "online" | "offline";

export type ToolName =
  | "terminal"
  | "files"
  | "git"
  | "build"
  | "deploy"
  | "preview";

export type ToolState = "online" | "offline";

export type PlanStep = {
  id: string;
  agent: AgentId;
  title: string;
  dependsOn: string[];
};

export type Project = {
  id: string;
  name: string;
  createdAt: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "sam";
  text: string;
  at: string;
};

export type BrainMap = Record<BrainName, BrainState>;
export type ToolMap = Record<ToolName, ToolState>;

export type WorkspaceFile = {
  path: string;
  bytes: number;
};

export type ClientMessage =
  | { type: "auth"; token: string }
  | { type: "project.create"; name: string }
  | { type: "project.open"; projectId: string }
  | { type: "workspace.load"; projectId: string }
  | { type: "file.read"; projectId: string; path: string }
  | { type: "chat.send"; projectId: string; text: string };

export type ServerEvent =
  | {
      type: "auth.ok";
      brains: BrainMap;
      tools: ToolMap;
      projects: Project[];
    }
  | { type: "auth.denied" }
  | { type: "project.created"; project: Project }
  | { type: "history"; projectId: string; messages: ChatMessage[] }
  | { type: "intent.ready"; intent: IntentId; summary: string }
  | { type: "plan.ready"; steps: PlanStep[] }
  | {
      type: "agent.update";
      agent: AgentId;
      status: AgentStatus;
      detail: string;
    }
  | { type: "terminal"; line: string }
  | { type: "token"; text: string }
  | { type: "risk.blocked"; reason: string }
  | {
      type: "workspace";
      projectId: string;
      files: WorkspaceFile[];
      diff: string;
      previewPath: string;
      build: string;
      deploy: string;
    }
  | { type: "file"; projectId: string; path: string; content: string }
  | { type: "message.done" }
  | { type: "error"; message: string };

export const AGENTS: { id: AgentId; title: string; role: string }[] = [
  {
    id: "researcher",
    title: "Researcher",
    role: "Reads docs and gathers references",
  },
  {
    id: "architect",
    title: "Architect",
    role: "Builds the plan and dependency graph",
  },
  {
    id: "coder",
    title: "Coder",
    role: "Writes the change on the server workspace",
  },
  {
    id: "reviewer",
    title: "Reviewer",
    role: "Checks the result against the request",
  },
  {
    id: "tester",
    title: "Tester",
    role: "Checks HTML and script syntax",
  },
  {
    id: "devops",
    title: "DevOps",
    role: "Publishes a finished page on the server",
  },
  {
    id: "memory",
    title: "Memory",
    role: "Stores project facts for the next turn",
  },
];
