# SAM AI

Self-hosted software engineer for a thin client. The Zenbook runs the interface only. The gateway, orchestrator, workspace, git history, and preview run on the server.

SAM AI is the product name.

## What runs where

| Piece | Where | Role |
| --- | --- | --- |
| Thin client | Zenbook, `npm run dev:client` | Chat, projects, agents, preview, files, diff, terminal |
| Gateway | Server, port `8797` | WebSocket, access token, rate limit, preview proxy |
| Orchestrator | Server, port `8788` | Intent, plan, agents, searchable memory, workspace |
| Model brain | Ollama on the server, `qwen2.5-coder:3b` | OpenAI-compatible chat at `MODEL_BASE_URL` |
| Deploy | Gateway `/sites/<id>/` | A site with `index.html` is published on the server |

The action loop follows the same shape as [OpenHands](https://github.com/OpenHands/OpenHands) (MIT): the orchestrator emits actions, the workspace returns observations, and the client renders the event stream. File writes are whole-file edits followed by a git commit, the same working pattern as [Aider](https://github.com/Aider-AI/aider) (Apache-2.0). SAM does not include their source code.

## Run

```powershell
npm install
copy .env.example .env
npm run dev:server
npm run dev:client
```

Open http://127.0.0.1:5173. On that address the client signs in by itself when `VITE_SAM_ACCESS_TOKEN` matches `SAM_ACCESS_TOKEN`.

Each agent does its own job. Research reads the workspace and searches memory. The architect or coder calls the model. The reviewer checks the answer. The tester checks HTML and script syntax. DevOps publishes a page that contains `index.html`. A question does not rewrite an existing site.

On this machine port `8787` was already taken, so the gateway listens on `8797`.

## Remote model

The model brain is Ollama on the server, at `http://127.0.0.1:11434/v1`, model `qwen2.5-coder:3b`.

```powershell
ollama pull qwen2.5-coder:3b
```

To move inference to another GPU, change `MODEL_BASE_URL` in `.env` and restart the server. The Zenbook client still does not run the model.

A finished site is published at `http://127.0.0.1:8797/sites/<project-id>/`.

## Tests

```powershell
npm test
```

## کوردی

زێنبووک تەنها ڕووکارە. مۆدێل، بیرگە، فایل، git و پێشبینین لەسەر سێرڤەرن. لە http://127.0.0.1:5173 خۆی دەچێتە ژوورەوە. ناوی سیستەمەکە SAM AI ـە.
