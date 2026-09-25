import { createServer, type IncomingMessage } from "node:http";
import { loadRootEnv, requireAccessToken } from "./env.js";
import { createProject, listProjects } from "./memory.js";
import { brainStatus, toolStatus } from "./model.js";
import { orchestrate, projectHistory } from "./orchestrate.js";
import {
  contentType,
  readWorkspaceFile,
  readWorkspaceText,
  workspaceSnapshot,
} from "./workspace.js";

loadRootEnv(import.meta.url);
const token = requireAccessToken();
const host = process.env.ORCH_HOST?.trim() || "127.0.0.1";
const port = Number(process.env.ORCH_PORT ?? 8788);

function readBody(req: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function authorized(req: IncomingMessage) {
  return req.headers.authorization === `Bearer ${token}`;
}

const server = createServer(async (req, res) => {
  if (!authorized(req)) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }

  const url = new URL(req.url ?? "/", "http://orchestrator");

  if (req.method === "GET" && url.pathname === "/v1/state") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        brains: brainStatus(),
        tools: toolStatus(),
        projects: listProjects(),
      }),
    );
    return;
  }

  if (req.method === "GET" && url.pathname === "/v1/history") {
    const projectId = url.searchParams.get("projectId") ?? "";
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ projectId, messages: projectHistory(projectId) }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/v1/projects") {
    const body = JSON.parse(await readBody(req)) as { name?: string };
    const project = createProject(body.name ?? "Untitled");
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ project }));
    return;
  }

  if (req.method === "GET" && url.pathname === "/v1/workspace") {
    const projectId = url.searchParams.get("projectId") ?? "";
    try {
      const snapshot = workspaceSnapshot(projectId);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ type: "workspace", projectId, ...snapshot }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "workspace failed";
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: message }));
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/v1/file") {
    const projectId = url.searchParams.get("projectId") ?? "";
    const path = url.searchParams.get("path") ?? "";
    try {
      const content = readWorkspaceText(projectId, path);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ type: "file", projectId, path, content }));
    } catch {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
    }
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/preview/")) {
    const rest = decodeURIComponent(url.pathname.slice("/preview/".length));
    const slash = rest.indexOf("/");
    const projectId = slash === -1 ? rest : rest.slice(0, slash);
    const rel = (slash === -1 ? "index.html" : rest.slice(slash + 1)) || "index.html";
    try {
      const body = readWorkspaceFile(projectId, rel);
      res.writeHead(200, {
        "content-type": contentType(rel),
        "cache-control": "no-store",
      });
      res.end(body);
    } catch {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("not found");
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/v1/turn") {
    const body = JSON.parse(await readBody(req)) as {
      projectId?: string;
      text?: string;
    };
    res.writeHead(200, { "content-type": "application/x-ndjson" });
    await orchestrate(
      { projectId: body.projectId ?? "", text: body.text ?? "" },
      (event) => {
        res.write(`${JSON.stringify(event)}\n`);
      },
    );
    res.end();
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not_found" }));
});

server.listen(port, host, () => {
  console.log(`orchestrator listening on http://${host}:${port}`);
});
