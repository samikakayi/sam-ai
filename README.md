# SAM AI

Self-hosted software engineer for a thin client. The Zenbook runs the interface only. The gateway, orchestrator, workspace, git history, and preview run on the server.

SAM AI is the product name.

## What runs where

| Piece | Where | Role |
| --- | --- | --- |
| Thin client | Zenbook, `npm run dev:client` | Chat, projects, agents, preview, files, diff, terminal |
| Gateway | Server, port `8797` | WebSocket, access token, rate limit, preview proxy |
| Orchestrator | Server, port `8788` | Intent, plan, agents, memory, workspace |
| Model brain | Remote GPU | Optional. Set `MODEL_BASE_URL` to an OpenAI-compatible endpoint |
| Deploy | Not configured | Preview stays on the server until a host is added |

The action loop follows the same shape as [OpenHands](https://github.com/OpenHands/OpenHands) (MIT): the orchestrator emits actions, the workspace returns observations, and the client renders the event stream. File writes are whole-file edits followed by a git commit, the same working pattern as [Aider](https://github.com/Aider-AI/aider) (Apache-2.0). SAM does not include their source code.

## Run

```powershell
npm install
copy .env.example .env
npm run dev:server
npm run dev:client
```

Open http://127.0.0.1:5173 and paste `SAM_ACCESS_TOKEN` from `.env`.

On this machine port `8787` was already taken, so the gateway listens on `8797`.

## Remote model

```text
MODEL_BASE_URL=http://192.168.1.20:11434/v1
MODEL_NAME=qwen2.5-coder:14b
```

When that endpoint is empty, SAM still writes a real workspace with the local builder, then commits it. When the endpoint is set, SAM applies `FILE:` blocks from the model onto the same workspace.

## Tests

```powershell
npm test
```

## کوردی

زێنبووک تەنها ڕووکارە. مۆدێل، بیرگە، فایل، git و پێشبینین لەسەر سێرڤەرن. ناوی سیستەمەکە SAM AI ـە.
