import { useEffect, useRef, useState, type FormEvent } from "react";
import { AGENTS, type AgentId, type ToolName } from "@sam/protocol";
import { useSession } from "./useSession";

const GATEWAY_KEY = "sam.gateway";
const TOKEN_KEY = "sam.token";

const TOOLS: { id: ToolName; label: string }[] = [
  { id: "preview", label: "Preview" },
  { id: "files", label: "Files" },
  { id: "git", label: "Git" },
  { id: "build", label: "Build" },
  { id: "deploy", label: "Deploy" },
  { id: "terminal", label: "Terminal" },
];

const TABS = ["Agents", "Preview", "Files", "Diff", "Terminal"] as const;

export function App() {
  const [gateway, setGateway] = useState(
    () => localStorage.getItem(GATEWAY_KEY) ?? "ws://127.0.0.1:8797/ws",
  );
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) ?? "");
  const [armed, setArmed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [projectName, setProjectName] = useState("");
  const [text, setText] = useState("");
  const [tab, setTab] = useState<(typeof TABS)[number]>("Agents");
  const seenPreview = useRef("");
  const session = useSession(gateway, token, armed, attempt);

  useEffect(() => {
    if (session.previewPath && session.previewPath !== seenPreview.current) {
      seenPreview.current = session.previewPath;
      setTab("Preview");
    }
  }, [session.previewPath]);

  useEffect(() => {
    if (!starting) return;
    if (session.connection === "online" || session.connection === "denied") {
      setStarting(false);
    }
    if (session.connection === "offline" && session.notice) {
      setStarting(false);
    }
  }, [session.connection, session.notice, starting]);

  function connect(event: FormEvent) {
    event.preventDefault();
    const nextGateway = gateway.trim();
    const nextToken = token.trim();
    localStorage.setItem(GATEWAY_KEY, nextGateway);
    sessionStorage.setItem(TOKEN_KEY, nextToken);
    setGateway(nextGateway);
    setToken(nextToken);
    setStarting(true);
    setAttempt((current) => current + 1);
    setArmed(true);
  }

  function disconnect() {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken("");
    setArmed(false);
  }

  if (
    !armed ||
    session.connection === "denied" ||
    (session.connection === "offline" && !starting)
  ) {
    return (
      <main className="gate">
        <form className="gate-card" onSubmit={connect}>
          <p className="eyebrow">Thin client</p>
          <h1>SAM AI</h1>
          <p className="lede">
            This Zenbook only shows the session. Models, memory, and tools stay on the server.
          </p>
          <label>
            Gateway
            <input
              value={gateway}
              onChange={(event) => setGateway(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label>
            Access token
            <input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              autoComplete="off"
            />
          </label>
          {session.connection === "denied" ? (
            <p className="warn">Access denied. Check the token in the server .env file.</p>
          ) : null}
          {session.notice ? <p className="warn">{session.notice}</p> : null}
          <button type="submit">Connect</button>
        </form>
      </main>
    );
  }

  if (session.connection !== "online") {
    return (
      <main className="gate">
        <p className="eyebrow">Connecting</p>
        <h1>SAM AI</h1>
        {session.notice ? <p className="warn">{session.notice}</p> : null}
      </main>
    );
  }

  const project = session.projects.find((item) => item.id === session.projectId);

  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          <strong>SAM</strong>
          <span>AI</span>
        </div>
        <p className="top-meta">Ecosystem · thin client</p>
        <p className={`live ${session.connection}`}>
          <i />
          {session.connection}
        </p>
        <button className="text" type="button" onClick={disconnect}>
          Disconnect
        </button>
      </header>

      <aside className="rail">
        <p className="eyebrow">Project Manager</p>
        <ul className="projects">
          {session.projects.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={item.id === session.projectId ? "active" : ""}
                onClick={() => session.openProject(item.id)}
              >
                <span>{item.name}</span>
                <small>{item.id.slice(0, 8)}</small>
              </button>
            </li>
          ))}
        </ul>
        <form
          className="new-project"
          onSubmit={(event) => {
            event.preventDefault();
            if (!projectName.trim()) return;
            session.createProject(projectName.trim());
            setProjectName("");
          }}
        >
          <input
            value={projectName}
            placeholder="New project"
            onChange={(event) => setProjectName(event.target.value)}
          />
          <button type="submit">Add</button>
        </form>
      </aside>

      <section className="chat">
        <div className="chat-head">
          <div>
            <p className="eyebrow">Chat</p>
            <h2>{project?.name ?? "No project"}</h2>
          </div>
          {session.intent ? <p className="intent">{session.intent}</p> : null}
        </div>
        {session.plan.length > 0 ? (
          <ol className="plan">
            {session.plan.map((step) => (
              <li key={step.id}>
                <span>{step.agent}</span>
                <strong dir="auto">{step.title}</strong>
                {step.dependsOn.length > 0 ? (
                  <small>after {step.dependsOn.join(", ")}</small>
                ) : null}
              </li>
            ))}
          </ol>
        ) : null}
        <div className="log">
          {session.messages.length === 0 && !session.draft ? (
            <p className="quiet">Send a build, fix, research, or deploy request.</p>
          ) : null}
          {session.messages.map((message) => (
            <article key={message.id} className={`turn ${message.role}`}>
              <p className="who">{message.role === "user" ? "You" : "SAM"}</p>
              <p className="body" dir="auto">
                {message.text}
              </p>
            </article>
          ))}
          {session.draft ? (
            <article className="turn sam">
              <p className="who">SAM</p>
              <p className="body" dir="auto">
                {session.draft}
              </p>
            </article>
          ) : null}
        </div>
        {session.notice ? <p className="warn bar">{session.notice}</p> : null}
        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault();
            session.chat(text);
            setText("");
          }}
        >
          <textarea
            dir="auto"
            value={text}
            placeholder="What should SAM build?"
            disabled={session.busy}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                session.chat(text);
                setText("");
              }
            }}
          />
          <button type="submit" disabled={session.busy || !text.trim()}>
            {session.busy ? "Working" : "Send"}
          </button>
        </form>
      </section>

      <aside className="status">
        <div className="tabs">
          {TABS.map((name) => (
            <button
              key={name}
              type="button"
              className={tab === name ? "tab on" : "tab"}
              onClick={() => setTab(name)}
            >
              {name}
            </button>
          ))}
        </div>
        {tab === "Agents" ? (
          <>
            <ul className="agents">
              {AGENTS.map((agent) => {
                const view = session.agents[agent.id as AgentId];
                return (
                  <li key={agent.id}>
                    <div>
                      <strong>{agent.title}</strong>
                      <small>{view.detail}</small>
                    </div>
                    <em className={view.status}>{view.status}</em>
                  </li>
                );
              })}
            </ul>
            <ul className="brains">
              {session.brains
                ? Object.entries(session.brains).map(([name, state]) => (
                    <li key={name}>
                      <span>{name}</span>
                      <em className={state}>{state}</em>
                    </li>
                  ))
                : null}
              {TOOLS.map((tool) => (
                <li key={tool.id}>
                  <span>{tool.label}</span>
                  <em className={session.tools?.[tool.id] ?? "offline"}>
                    {session.tools?.[tool.id] ?? "offline"}
                  </em>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {tab === "Preview" ? (
          <div className="preview-wrap">
            <p className="worker">{session.build}</p>
            <p className="worker">{session.deploy}</p>
            {session.previewPath ? (
              <iframe title="Browser preview" src={session.previewPath} />
            ) : (
              <p className="quiet">No page in this workspace yet.</p>
            )}
          </div>
        ) : null}
        {tab === "Files" ? (
          <div className="files">
            {session.files.length === 0 ? <p className="quiet">No files yet.</p> : null}
            <ul>
              {session.files.map((file) => (
                <li key={file.path}>
                  <button type="button" className="text" onClick={() => session.readFile(file.path)}>
                    {file.path}
                  </button>
                </li>
              ))}
            </ul>
            {session.openFile ? (
              <pre className="terminal file-view">
                {session.openFile.path}
                {"\n\n"}
                {session.openFile.content}
              </pre>
            ) : null}
          </div>
        ) : null}
        {tab === "Diff" ? (
          <pre className="terminal diff">{session.diff || "No commits yet."}</pre>
        ) : null}
        {tab === "Terminal" ? (
          <pre className="terminal tall">
            {session.terminal.length === 0 ? "Workspace log is empty." : session.terminal.join("\n")}
          </pre>
        ) : null}
      </aside>
    </div>
  );
}
