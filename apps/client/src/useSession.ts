import { useCallback, useEffect, useRef, useState } from "react";
import {
  AGENTS,
  type AgentId,
  type AgentStatus,
  type BrainMap,
  type ChatMessage,
  type ClientMessage,
  type PlanStep,
  type Project,
  type ServerEvent,
  type ToolMap,
  type WorkspaceFile,
} from "@sam/protocol";

export type Connection = "offline" | "connecting" | "online" | "denied";

type AgentView = { status: AgentStatus; detail: string };

const idleAgents = () =>
  Object.fromEntries(
    AGENTS.map((agent) => [agent.id, { status: "idle" as AgentStatus, detail: "Standing by" }]),
  ) as Record<AgentId, AgentView>;

export function useSession(url: string, token: string, enabled: boolean, attempt: number) {
  const socketRef = useRef<WebSocket | null>(null);
  const deniedRef = useRef(false);
  const projectRef = useRef("");
  const draftRef = useRef("");
  const [connection, setConnection] = useState<Connection>("offline");
  const [brains, setBrains] = useState<BrainMap | null>(null);
  const [tools, setTools] = useState<ToolMap | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [agents, setAgents] = useState(idleAgents);
  const [plan, setPlan] = useState<PlanStep[]>([]);
  const [intent, setIntent] = useState("");
  const [terminal, setTerminal] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [diff, setDiff] = useState("");
  const [previewPath, setPreviewPath] = useState("");
  const [build, setBuild] = useState("Empty workspace");
  const [deploy, setDeploy] = useState("Not published");
  const [openFile, setOpenFile] = useState<{ path: string; content: string } | null>(null);

  const send = useCallback((message: ClientMessage) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(message));
  }, []);

  const openProject = useCallback(
    (id: string) => {
      projectRef.current = id;
      setProjectId(id);
      setMessages([]);
      draftRef.current = "";
      setDraft("");
      setPlan([]);
      setIntent("");
      setAgents(idleAgents());
      setTerminal([]);
      setNotice("");
      setFiles([]);
      setDiff("");
      setPreviewPath("");
      setOpenFile(null);
      send({ type: "project.open", projectId: id });
      send({ type: "workspace.load", projectId: id });
    },
    [send],
  );

  useEffect(() => {
    if (!enabled || !url || !token) return;
    let cancelled = false;
    deniedRef.current = false;
    setConnection("connecting");
    setNotice("");
    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.onopen = () => {
      if (cancelled) return;
      socket.send(JSON.stringify({ type: "auth", token } satisfies ClientMessage));
    };

    socket.onmessage = (event) => {
      if (cancelled) return;
      const data = JSON.parse(String(event.data)) as ServerEvent;
      if (data.type === "auth.ok") {
        setConnection("online");
        setBrains(data.brains);
        setTools(data.tools);
        setProjects(data.projects);
        const first = data.projects[0];
        if (first) {
          projectRef.current = first.id;
          setProjectId(first.id);
          socket.send(JSON.stringify({ type: "project.open", projectId: first.id }));
          socket.send(JSON.stringify({ type: "workspace.load", projectId: first.id }));
        }
        return;
      }
      if (data.type === "auth.denied") {
        deniedRef.current = true;
        setConnection("denied");
        socket.close();
        return;
      }
      if (data.type === "project.created") {
        setProjects((current) => [data.project, ...current]);
        projectRef.current = data.project.id;
        setProjectId(data.project.id);
        setMessages([]);
        draftRef.current = "";
        setDraft("");
        setPlan([]);
        setFiles([]);
        setDiff("");
        setPreviewPath("");
        setOpenFile(null);
        return;
      }
      if (data.type === "history") {
        if (projectRef.current === data.projectId) setMessages(data.messages);
        return;
      }
      if (data.type === "intent.ready") {
        setIntent(data.summary);
        return;
      }
      if (data.type === "plan.ready") {
        setPlan(data.steps);
        return;
      }
      if (data.type === "agent.update") {
        setAgents((current) => ({
          ...current,
          [data.agent]: { status: data.status, detail: data.detail },
        }));
        return;
      }
      if (data.type === "terminal") {
        setTerminal((current) => [...current.slice(-180), data.line]);
        return;
      }
      if (data.type === "token") {
        draftRef.current += data.text;
        setDraft(draftRef.current);
        return;
      }
      if (data.type === "risk.blocked") {
        setNotice(data.reason);
        return;
      }
      if (data.type === "error") {
        setNotice(data.message);
        setBusy(false);
        setConnection((current) => (current === "online" ? current : "offline"));
        return;
      }
      if (data.type === "workspace" && projectRef.current === data.projectId) {
        setFiles(data.files);
        setDiff(data.diff);
        setPreviewPath(data.previewPath);
        setBuild(data.build);
        setDeploy(data.deploy);
        return;
      }
      if (data.type === "file" && projectRef.current === data.projectId) {
        setOpenFile({ path: data.path, content: data.content });
        return;
      }
      if (data.type === "message.done") {
        const text = draftRef.current;
        draftRef.current = "";
        setDraft("");
        if (text.trim()) {
          setMessages((items) => [
            ...items,
            {
              id: crypto.randomUUID(),
              role: "sam",
              text,
              at: new Date().toISOString(),
            },
          ]);
        }
        setBusy(false);
      }
    };

    socket.onerror = () => {
      if (!cancelled) setNotice("Gateway connection failed.");
    };
    socket.onclose = () => {
      if (cancelled) return;
      setBusy(false);
      if (deniedRef.current) {
        setConnection("denied");
        return;
      }
      setConnection("offline");
      setNotice((current) => current || "Disconnected.");
    };

    return () => {
      cancelled = true;
      socket.close();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [attempt, enabled, token, url]);

  function createProject(name: string) {
    send({ type: "project.create", name });
  }

  function chat(text: string) {
    if (!projectRef.current || !text.trim() || busy) return;
    setBusy(true);
    setNotice("");
    draftRef.current = "";
    setDraft("");
    setAgents(idleAgents());
    setMessages((items) => [
      ...items,
      {
        id: crypto.randomUUID(),
        role: "user",
        text: text.trim(),
        at: new Date().toISOString(),
      },
    ]);
    send({ type: "chat.send", projectId: projectRef.current, text: text.trim() });
  }

  function readFile(path: string) {
    if (!projectRef.current) return;
    send({ type: "file.read", projectId: projectRef.current, path });
  }

  return {
    connection,
    brains,
    tools,
    projects,
    projectId,
    messages,
    draft,
    busy,
    agents,
    plan,
    intent,
    terminal,
    notice,
    files,
    diff,
    previewPath,
    build,
    deploy,
    openFile,
    openProject,
    createProject,
    chat,
    readFile,
  };
}
