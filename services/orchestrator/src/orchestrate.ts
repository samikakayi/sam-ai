import { randomUUID } from "node:crypto";
import type { ChatMessage, ServerEvent } from "@sam/protocol";
import { draftProject, localBuildNote, parseFileBlocks } from "./builder.js";
import { analyzeIntent, userWroteKurdish } from "./intent.js";
import { appendMessage, getProject, history, recall, remember } from "./memory.js";
import { modelConfig, streamModel } from "./model.js";
import { buildPlan } from "./planner.js";
import { assessRisk, needsConfirmation } from "./risk.js";
import {
  commitWorkspace,
  listWorkspace,
  verifyWorkspace,
  workspaceSnapshot,
  writeWorkspaceFile,
} from "./workspace.js";

type Emit = (event: ServerEvent) => void;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function heldAnswer(kurdish: boolean) {
  return kurdish
    ? "ئەم داواکارییە گۆڕانکارییەکی مەترسیدارە. SAM هیچ فایلێک نانووسێت تا پشتڕاستی بکەیتەوە."
    : "This request can destroy work. SAM will not write files until you confirm it.";
}

export async function orchestrate(
  input: { projectId: string; text: string },
  emit: Emit,
) {
  const text = input.text.trim();
  if (!text) {
    emit({ type: "error", message: "Empty message." });
    emit({ type: "message.done" });
    return;
  }

  const project = getProject(input.projectId);
  if (!project) {
    emit({ type: "error", message: "Unknown project." });
    emit({ type: "message.done" });
    return;
  }

  const userMessage: ChatMessage = {
    id: randomUUID(),
    role: "user",
    text,
    at: new Date().toISOString(),
  };
  appendMessage(project.id, userMessage);

  const risk = assessRisk(text);
  if (risk.blocked) {
    emit({ type: "risk.blocked", reason: risk.reason });
    emit({
      type: "agent.update",
      agent: "reviewer",
      status: "blocked",
      detail: risk.reason,
    });
    emit({ type: "terminal", line: "risk controller blocked the turn" });
    const reply: ChatMessage = {
      id: randomUUID(),
      role: "sam",
      text: risk.reason,
      at: new Date().toISOString(),
    };
    appendMessage(project.id, reply);
    emit({ type: "token", text: risk.reason });
    emit({ type: "message.done" });
    return;
  }

  const kurdish = userWroteKurdish(text);
  const intent = analyzeIntent(text);
  emit({ type: "intent.ready", intent: intent.id, summary: intent.summary });
  emit({ type: "terminal", line: `intent ${intent.id}` });

  emit({
    type: "agent.update",
    agent: "architect",
    status: "running",
    detail: "Building the dependency graph",
  });
  const plan = buildPlan(intent.id, kurdish);
  await wait(40);
  emit({ type: "plan.ready", steps: plan });
  emit({
    type: "agent.update",
    agent: "architect",
    status: "done",
    detail: intent.summary,
  });

  const confirm = needsConfirmation(text);
  if (confirm) {
    emit({ type: "terminal", line: "destructive request held for confirmation" });
  }

  const memory = recall(project.id);
  const existing = listWorkspace(project.id);
  emit({
    type: "agent.update",
    agent: "researcher",
    status: "done",
    detail: `${existing.length} workspace file(s)`,
  });
  emit({ type: "terminal", line: `workspace files ${existing.length}` });

  let answer = "";
  let wrote: string[] = [];

  const shouldWrite =
    !confirm && intent.id !== "explain" && intent.id !== "research" && intent.id !== "deploy";

  if (confirm) {
    answer = heldAnswer(kurdish);
    emit({ type: "token", text: answer });
  } else if (modelConfig().online && shouldWrite) {
    emit({
      type: "agent.update",
      agent: "coder",
      status: "running",
      detail: modelConfig().model,
    });
    emit({ type: "terminal", line: `model ${modelConfig().model}` });
    const system = [
      "You are SAM, the coder inside a self-hosted orchestrator.",
      "Reply in the same language as the user.",
      "When creating or editing files, output each one as:",
      "FILE: relative/path",
      "```lang",
      "contents",
      "```",
      "Do not claim you deployed the project.",
      `Intent: ${intent.summary}.`,
      `Existing files: ${existing.map((file) => file.path).join(", ") || "none"}.`,
      memory.facts.length ? `Project memory: ${memory.facts.join(" | ")}` : "Project memory: none yet.",
    ].join("\n");
    try {
      answer = await streamModel(
        system,
        memory.recent.map((message) => ({
          role: message.role === "sam" ? ("assistant" as const) : ("user" as const),
          content: message.text,
        })),
        (token) => emit({ type: "token", text: token }),
      );
      wrote = applyDrafts(project.id, parseFileBlocks(answer), intent.summary);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Model call failed";
      emit({ type: "terminal", line: message });
      const drafts = draftProject({
        projectId: project.id,
        projectName: project.name,
        text,
        intent: intent.id,
        kurdish,
      });
      wrote = applyDrafts(project.id, drafts, intent.summary);
      answer = localBuildNote(kurdish, wrote);
      emit({ type: "token", text: answer });
    }
  } else if (shouldWrite) {
    emit({
      type: "agent.update",
      agent: "coder",
      status: "running",
      detail: "Local workspace builder",
    });
    emit({ type: "terminal", line: "model brain offline — writing on the server workspace" });
    const drafts = draftProject({
      projectId: project.id,
      projectName: project.name,
      text,
      intent: intent.id,
      kurdish,
    });
    wrote = applyDrafts(project.id, drafts, intent.summary);
    answer = localBuildNote(kurdish, wrote);
    emit({ type: "token", text: answer });
  } else if (intent.id === "deploy") {
    answer = kurdish
      ? "هیچ خانەخوێیەکی بڵاوکردنەوە دانەنراوە. فایلەکان لە وۆرکسپەیسدان و پێشبینینی ناوخۆیی ئامادەیە."
      : "No deploy host is configured. The files stay in the workspace, with a local preview.";
    emit({ type: "token", text: answer });
  } else {
    answer = kurdish
      ? `مێشکی مۆدێل بەستراو نییە. پرسیارەکە: ${intent.summary}. فایلەکانی وۆرکسپەیس نەگۆڕدران.`
      : `The model brain is offline. Question: ${intent.summary}. Workspace files were left unchanged.`;
    emit({ type: "token", text: answer });
  }

  if (answer.includes(process.env.SAM_ACCESS_TOKEN ?? "\u0000")) {
    answer = answer.split(process.env.SAM_ACCESS_TOKEN ?? "").join("[redacted]");
  }

  const snapshot = workspaceSnapshot(project.id);
  emit({ type: "workspace", projectId: project.id, ...snapshot });
  const check = verifyWorkspace(project.id);

  emit({
    type: "agent.update",
    agent: "coder",
    status: "done",
    detail: wrote.length ? wrote.join(", ") : "No file changes",
  });
  emit({
    type: "agent.update",
    agent: "reviewer",
    status: check.ok ? "done" : "blocked",
    detail: check.note,
  });
  emit({
    type: "agent.update",
    agent: "tester",
    status: check.ok ? "done" : "blocked",
    detail: check.note,
  });
  emit({
    type: "agent.update",
    agent: "devops",
    status: "done",
    detail: snapshot.previewPath ? snapshot.build : snapshot.deploy,
  });
  emit({ type: "terminal", line: check.note });

  remember(project.id, `${intent.summary}: ${text.slice(0, 180)} → ${wrote.join(", ") || "no files"}`);
  emit({
    type: "agent.update",
    agent: "memory",
    status: "done",
    detail: "Fact stored on the server",
  });
  emit({ type: "terminal", line: "memory write ok" });

  appendMessage(project.id, {
    id: randomUUID(),
    role: "sam",
    text: answer,
    at: new Date().toISOString(),
  });
  emit({ type: "message.done" });
}

export function projectHistory(projectId: string) {
  return history(projectId);
}

function applyDrafts(
  projectId: string,
  drafts: { path: string; content: string }[],
  message: string,
) {
  if (drafts.length === 0) return [];
  for (const file of drafts) {
    writeWorkspaceFile(projectId, file.path, file.content);
  }
  commitWorkspace(projectId, message);
  return drafts.map((file) => file.path);
}
