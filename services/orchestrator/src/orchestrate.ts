import { randomUUID } from "node:crypto";
import type { ChatMessage, ServerEvent } from "@sam/protocol";
import { draftProject, localBuildNote, parseFileBlocks } from "./builder.js";
import { analyzeIntent, userWroteKurdish } from "./intent.js";
import { appendMessage, getProject, history, recall, remember } from "./memory.js";
import { modelConfig, streamModel } from "./model.js";
import { buildPlan } from "./planner.js";
import { assessRisk, needsConfirmation } from "./risk.js";
import {
  checkWorkspace,
  commitWorkspace,
  listWorkspace,
  publishWorkspace,
  workspaceBrief,
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

  const plan = buildPlan(intent.id, kurdish);
  emit({ type: "plan.ready", steps: plan });

  const confirm = needsConfirmation(text);
  if (confirm) {
    emit({ type: "terminal", line: "destructive request held for confirmation" });
  }

  const memory = recall(project.id, text);
  const shouldWrite =
    !confirm && intent.id !== "explain" && intent.id !== "research" && intent.id !== "deploy";
  const ownsAnswer = intent.id === "explain" || intent.id === "research" ? "architect" : "coder";

  let answer = "";
  let wrote: string[] = [];
  let brief = "";
  let blockPublish = false;

  async function produceAnswer(allowWrite: boolean) {
    const existing = listWorkspace(project.id);
    if (!modelConfig().online) {
      if (allowWrite) {
        emit({ type: "terminal", line: "model brain offline — writing on the server workspace" });
        const drafts = draftProject({
          projectId: project.id,
          projectName: project.name,
          text,
          intent: intent.id,
          kurdish,
        });
        wrote = applyDrafts(project.id, drafts, intent.summary);
        const note = localBuildNote(kurdish, wrote);
        emit({ type: "token", text: note });
        return note;
      }
      const note = kurdish
        ? `مێشکی مۆدێل بەستراو نییە. پرسیارەکە: ${intent.summary}. فایلەکانی وۆرکسپەیس نەگۆڕدران.`
        : `The model brain is offline. Question: ${intent.summary}. Workspace files were left unchanged.`;
      emit({ type: "token", text: note });
      return note;
    }

    emit({ type: "terminal", line: `model ${modelConfig().model}` });
    const system = [
      "You are SAM, the coder inside a self-hosted orchestrator.",
      "Reply in the same language as the user.",
      allowWrite
        ? "When creating or editing files, output each one as:\nFILE: relative/path\n```lang\ncontents\n```"
        : "Answer in prose. Do not invent file edits.",
      "Do not claim a deploy unless the user asked to publish.",
      `Intent: ${intent.summary}.`,
      brief || `Existing files: ${existing.map((file) => file.path).join(", ") || "none"}.`,
    ].join("\n");
    try {
      let full = await streamModel(
        system,
        memory.recent.map((message) => ({
          role: message.role === "sam" ? ("assistant" as const) : ("user" as const),
          content: message.text,
        })),
        (token) => emit({ type: "token", text: token }),
      );
      if (allowWrite) {
        wrote = applyDrafts(project.id, parseFileBlocks(full), intent.summary);
        const hasPage = existing.some((file) => file.path === "index.html");
        if (wrote.length === 0 && !hasPage) {
          const drafts = draftProject({
            projectId: project.id,
            projectName: project.name,
            text,
            intent: intent.id,
            kurdish,
          });
          wrote = applyDrafts(project.id, drafts, intent.summary);
          const note = `\n\n${localBuildNote(kurdish, wrote)}`;
          full += note;
          emit({ type: "token", text: note });
        }
      }
      return full;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Model call failed";
      emit({ type: "terminal", line: message });
      if (allowWrite) {
        const drafts = draftProject({
          projectId: project.id,
          projectName: project.name,
          text,
          intent: intent.id,
          kurdish,
        });
        wrote = applyDrafts(project.id, drafts, intent.summary);
        const note = localBuildNote(kurdish, wrote);
        emit({ type: "token", text: note });
        return note;
      }
      const note = kurdish
        ? `مێشکی مۆدێل وەڵامی نەدایەوە. ${message}`
        : `The model brain did not answer. ${message}`;
      emit({ type: "token", text: note });
      return note;
    }
  }

  for (const step of plan) {
    emit({ type: "agent.update", agent: step.agent, status: "running", detail: step.title });
    emit({ type: "terminal", line: `${step.id} ${step.agent}` });
    await wait(20);

    if (step.agent === "researcher") {
      const found = workspaceBrief(project.id);
      brief = [
        `Files: ${found.files.map((file) => file.path).join(", ") || "none"}.`,
        memory.facts.length ? `Retrieved memory: ${memory.facts.join(" | ")}` : "Retrieved memory: none.",
        found.excerpts.length ? `Excerpts:\n${found.excerpts.join("\n\n")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      emit({
        type: "agent.update",
        agent: "researcher",
        status: "done",
        detail: `${found.files.length} files, ${memory.matched} memory matches of ${memory.scanned}`,
      });
    } else if (step.agent === "architect") {
      if (ownsAnswer === "architect" && !confirm) {
        answer = await produceAnswer(false);
      }
      emit({
        type: "agent.update",
        agent: "architect",
        status: "done",
        detail: plan.map((item) => item.id).join(" → "),
      });
    } else if (step.agent === "coder") {
      if (confirm) {
        answer = heldAnswer(kurdish);
        emit({ type: "token", text: answer });
      } else if (ownsAnswer === "coder") {
        answer = await produceAnswer(shouldWrite);
      }
      emit({
        type: "agent.update",
        agent: "coder",
        status: "done",
        detail: wrote.length ? wrote.join(", ") : "No file changes",
      });
    } else if (step.agent === "reviewer") {
      const stop = new Set([
        "what",
        "when",
        "where",
        "which",
        "how",
        "does",
        "this",
        "that",
        "with",
        "from",
        "your",
        "have",
        "about",
        "چیە",
        "چییە",
      ]);
      const terms = text
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((word) => word.length > 2 && !stop.has(word));
      const covered =
        terms.length === 0 || terms.some((word) => answer.toLowerCase().includes(word));
      const files = listWorkspace(project.id);
      const missingPage = intent.id === "deploy" && files.length === 0;
      const missingWrite = shouldWrite && wrote.length === 0;
      const missedQuestion =
        (intent.id === "explain" || intent.id === "research") && !covered;
      if (missingPage || missingWrite || missedQuestion) {
        blockPublish = missingPage || missingWrite;
        const detail = missingPage
          ? kurdish
            ? "هیچ فایلێک نییە بۆ بڵاوکردنەوە"
            : "No files to publish"
          : missingWrite
            ? kurdish
              ? "هیچ فایلێک نەنووسرا"
              : "No files were written"
            : kurdish
              ? "وەڵامەکە پرسیارەکە ناگرێتەوە"
              : "Answer missed the question";
        if (!answer) {
          answer = detail;
          emit({ type: "token", text: answer });
        }
        emit({ type: "agent.update", agent: "reviewer", status: "blocked", detail });
      } else {
        emit({
          type: "agent.update",
          agent: "reviewer",
          status: "done",
          detail: kurdish ? "لەگەڵ داواکارییەکە دەگونجێت" : "Matches the request",
        });
      }
    } else if (step.agent === "tester") {
      const check = checkWorkspace(project.id);
      emit({
        type: "agent.update",
        agent: "tester",
        status: check.ok ? "done" : "blocked",
        detail: check.note,
      });
      emit({ type: "terminal", line: check.note });
    } else if (step.agent === "devops") {
      const snapshot = workspaceSnapshot(project.id);
      const hasPage = snapshot.files.some((file) => file.path === "index.html");
      const publishing = step.id !== "d1" && !blockPublish && hasPage && (intent.id === "deploy" || shouldWrite);
      if (publishing) {
        const published = publishWorkspace(project.id);
        if (published && !answer.includes(published.path)) {
          const line = kurdish
            ? `\n\nبڵاوکرایەوە: http://127.0.0.1:8797${published.path}`
            : `\n\nPublished at http://127.0.0.1:8797${published.path}`;
          answer += line;
          emit({ type: "token", text: line });
        }
        emit({
          type: "agent.update",
          agent: "devops",
          status: "done",
          detail: published ? `Published ${published.path}` : snapshot.deploy,
        });
      } else {
        emit({
          type: "agent.update",
          agent: "devops",
          status: "done",
          detail: `${snapshot.build}. ${snapshot.deploy}`,
        });
      }
    } else if (step.agent === "memory") {
      remember(project.id, `${intent.summary}: ${text.slice(0, 180)} → ${wrote.join(", ") || "no files"}`);
      emit({
        type: "agent.update",
        agent: "memory",
        status: "done",
        detail: `Stored. Searched ${memory.scanned}, matched ${memory.matched}`,
      });
      emit({ type: "terminal", line: "memory write ok" });
    }
  }

  if (answer.includes(process.env.SAM_ACCESS_TOKEN ?? "\u0000")) {
    answer = answer.split(process.env.SAM_ACCESS_TOKEN ?? "").join("[redacted]");
  }

  const snapshot = workspaceSnapshot(project.id);
  emit({ type: "workspace", projectId: project.id, ...snapshot });

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
