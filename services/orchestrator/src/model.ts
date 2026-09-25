import type { BrainMap, ToolMap } from "@sam/protocol";

export type ModelConfig = {
  baseUrl: string;
  model: string;
  online: boolean;
};

export function modelConfig(): ModelConfig {
  const baseUrl = (process.env.MODEL_BASE_URL ?? "").trim().replace(/\/$/, "");
  const model = (process.env.MODEL_NAME ?? "").trim() || "qwen2.5-coder:3b";
  return { baseUrl, model, online: baseUrl.length > 0 };
}

export function brainStatus(): BrainMap {
  return {
    agents: "online",
    model: modelConfig().online ? "online" : "offline",
    memory: "online",
    tools: "online",
  };
}

export function toolStatus(): ToolMap {
  return {
    terminal: "online",
    files: "online",
    git: "online",
    build: "online",
    deploy: "online",
    preview: "online",
  };
}

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export async function streamModel(
  system: string,
  messages: ChatTurn[],
  onToken: (text: string) => void,
) {
  const config = modelConfig();
  if (!config.online) return "";

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      stream: true,
      temperature: 0.2,
      messages: [{ role: "system", content: system }, ...messages],
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Model brain returned HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const json = JSON.parse(data) as {
          choices?: { delta?: { content?: string } }[];
        };
        const token = json.choices?.[0]?.delta?.content ?? "";
        if (token) {
          full += token;
          onToken(token);
        }
      } catch {
        // Ignore a partial SSE frame that was not JSON.
      }
    }
  }

  return full;
}
