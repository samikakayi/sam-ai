import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import type { ClientMessage, ServerEvent } from "@sam/protocol";
import { loadRootEnv, requireAccessToken } from "./env.js";

loadRootEnv(import.meta.url);
const token = requireAccessToken();
const host = process.env.GATEWAY_HOST?.trim() || "127.0.0.1";
const port = Number(process.env.GATEWAY_PORT ?? 8797);
const orchestratorUrl = (process.env.ORCHESTRATOR_URL ?? "http://127.0.0.1:8788").replace(
  /\/$/,
  "",
);

const hits = new Map<string, number[]>();

function allow(key: string) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((stamp) => now - stamp < 60_000);
  if (recent.length >= 40) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

async function orch(path: string, init?: RequestInit) {
  const response = await fetch(`${orchestratorUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`orchestrator HTTP ${response.status}`);
  }
  return response;
}

function send(socket: WebSocket, event: ServerEvent) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
}

const httpServer = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "sam-gateway" }));
    return;
  }
  if (req.method === "GET" && (req.url ?? "").startsWith("/preview/")) {
    try {
      const upstream = await fetch(`${orchestratorUrl}${req.url}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const body = Buffer.from(await upstream.arrayBuffer());
      res.writeHead(upstream.status, {
        "content-type": upstream.headers.get("content-type") ?? "text/plain",
        "cache-control": "no-store",
      });
      res.end(body);
    } catch {
      res.writeHead(502, { "content-type": "text/plain" });
      res.end("preview unavailable");
    }
    return;
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not_found" }));
});

const sockets = new WebSocketServer({ server: httpServer, path: "/ws" });

sockets.on("connection", (socket, request) => {
  const address = request.socket.remoteAddress ?? "unknown";
  let authed = false;
  const timer = setTimeout(() => {
    if (!authed) socket.close(4001, "auth timeout");
  }, 5000);

  socket.on("message", async (raw) => {
    let message: ClientMessage;
    try {
      message = JSON.parse(String(raw)) as ClientMessage;
    } catch {
      send(socket, { type: "error", message: "Invalid JSON." });
      return;
    }

    if (!authed) {
      if (message.type === "auth" && message.token === token) {
        authed = true;
        clearTimeout(timer);
        try {
          const state = (await (await orch("/v1/state")).json()) as {
            brains: Extract<ServerEvent, { type: "auth.ok" }>["brains"];
            tools: Extract<ServerEvent, { type: "auth.ok" }>["tools"];
            projects: Extract<ServerEvent, { type: "auth.ok" }>["projects"];
          };
          send(socket, { type: "auth.ok", ...state });
        } catch (error) {
          send(socket, {
            type: "error",
            message: error instanceof Error ? error.message : "Orchestrator unreachable",
          });
          socket.close();
        }
      } else {
        send(socket, { type: "auth.denied" });
        socket.close(4003, "denied");
      }
      return;
    }

    if (!allow(address)) {
      send(socket, { type: "error", message: "Rate limit. Wait a minute." });
      return;
    }

    try {
      if (message.type === "project.create") {
        const created = (await (
          await orch("/v1/projects", {
            method: "POST",
            body: JSON.stringify({ name: message.name }),
          })
        ).json()) as { project: Extract<ServerEvent, { type: "project.created" }>["project"] };
        send(socket, { type: "project.created", project: created.project });
        return;
      }

      if (message.type === "project.open") {
        const history = (await (
          await orch(`/v1/history?projectId=${encodeURIComponent(message.projectId)}`)
        ).json()) as Extract<ServerEvent, { type: "history" }>;
        send(socket, {
          type: "history",
          projectId: history.projectId,
          messages: history.messages,
        });
        return;
      }

      if (message.type === "workspace.load") {
        const snapshot = (await (
          await orch(`/v1/workspace?projectId=${encodeURIComponent(message.projectId)}`)
        ).json()) as Extract<ServerEvent, { type: "workspace" }>;
        send(socket, snapshot);
        return;
      }

      if (message.type === "file.read") {
        const file = (await (
          await orch(
            `/v1/file?projectId=${encodeURIComponent(message.projectId)}&path=${encodeURIComponent(message.path)}`,
          )
        ).json()) as Extract<ServerEvent, { type: "file" }>;
        send(socket, { type: "file", ...file });
        return;
      }

      if (message.type === "chat.send") {
        const response = await orch("/v1/turn", {
          method: "POST",
          body: JSON.stringify({
            projectId: message.projectId,
            text: message.text,
          }),
        });
        if (!response.body) throw new Error("Empty orchestrator stream");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (line.trim()) socket.send(line);
          }
        }
        if (buffer.trim()) socket.send(buffer);
      }
    } catch (error) {
      send(socket, {
        type: "error",
        message: error instanceof Error ? error.message : "Gateway failure",
      });
      send(socket, { type: "message.done" });
    }
  });

  socket.on("close", () => clearTimeout(timer));
});

httpServer.listen(port, host, () => {
  console.log(`gateway listening on http://${host}:${port}`);
});
