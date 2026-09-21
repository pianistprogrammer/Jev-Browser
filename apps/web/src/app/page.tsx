"use client";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../api";
import { taskSummary, type Task, type TaskSummary } from "@jev/contracts";
import { TaskResult } from "./task-result";
import { formatElapsed } from "./elapsed";

export default function Workspace() {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [goal, setGoal] = useState("");
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [browserUrl, setBrowserUrl] = useState("");
  const [browserError, setBrowserError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [connection, setConnection] = useState("Connecting…");
  const [now, setNow] = useState(0);
  const busy = submitting || activeTask?.state === "running";

  function updateTask(task: Task) {
    setActiveTask(task);
    setTasks(current => [taskSummary(task), ...current.filter(item => item.id !== task.id)]);
  }

  useEffect(() => {
    let stopped = false;
    api.listTasks().then(async result => {
      if (stopped) return;
      setTasks(result.items);
      if (result.items.length) {
        const current = result.items.find(task => task.state === "running") ?? result.items[0];
        const loaded = await api.getTask(current.id);
        if (!stopped) setActiveTask(loaded.task);
      }
    }).catch(() => { if (!stopped) setMessage("Can't reach the browser service. Check that the app is running."); });
    fetch("/api/health").then(r => r.json()).then(health => {
      if (!stopped) setConnection(health.providerMode === "openrouter" ? "Connected" : "Demo mode");
    }).catch(() => { if (!stopped) setConnection("Disconnected"); });
    return () => { stopped = true; };
  }, []);

  useEffect(() => {
    if (!activeTask || activeTask.state !== "running") return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const id = activeTask.id;
    const poll = async () => {
      try {
        const { task } = await api.getTask(id);
        if (stopped) return;
        updateTask(task);
        if (task.state !== "running") return;
      } catch { if (!stopped) setMessage("Connection interrupted. Reconnecting…"); }
      if (!stopped) timer = setTimeout(poll, 650);
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [activeTask?.id, activeTask?.state]);

  useEffect(() => {
    if (!activeTask) return;
    setNow(Date.now());
    if (activeTask.state !== "running") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [activeTask?.id, activeTask?.state]);

  const elapsed = activeTask && now
    ? formatElapsed((activeTask.state === "running" ? now : new Date(activeTask.updatedAt).getTime()) - new Date(activeTask.createdAt).getTime())
    : undefined;

  // Poll browser status for the URL bar only (no screenshot needed — VNC iframe is the live view)
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const status = await fetch("/api/browser/status", { cache: "no-store" }).then(r => r.json());
        if (!stopped) {
          setBrowserUrl(status.active ? status.url : "");
          setBrowserError("");
        }
      } catch { if (!stopped) setBrowserError("Reconnecting…"); }
      if (!stopped) timer = setTimeout(poll, 1500);
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!goal.trim() || busy) return;
    setSubmitting(true);
    setMessage("");
    try {
      const created = await api.createTask({ goal: goal.trim() });
      const run = await api.runTask(created.task.id, created.task.version);
      updateTask(run.task);
      setGoal("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Couldn't start that request.");
    } finally { setSubmitting(false); }
  }

  async function stop() {
    if (!activeTask) return;
    try { updateTask((await api.cancelTask(activeTask.id)).task); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Couldn't stop the request."); }
  }

  const previousTasks = tasks.filter(t => t.id !== activeTask?.id);

  return (
    <div className="shell">
      <header className="topbar">
        <Link className="brand" href="/">
          <span className="logo">J</span>
          JEV Browser
        </Link>
        <div className="topmeta">
          {elapsed && <span className="elapsed-timer">{elapsed}</span>}
          <Link href="/settings">Settings</Link>
          <span>{connection}</span>
        </div>
      </header>

      <main className="main">
        <div className="conversation-workspace">
          <div className="operator-workspace">
            <div className="conversation-column">
              <div className="workspace-intro">
                <div className="eyebrow">Browser Assistant</div>
                <h1>What would you like to explore?</h1>
                <p>Describe a task and watch the browser work through it in real time.</p>
              </div>

              {activeTask && <TaskResult task={activeTask} />}
              {message && <div className="banner" role="alert">{message}</div>}

              <form className="conversation-composer" onSubmit={submit}>
                <label className="sr-only" htmlFor="goal">Your request</label>
                <textarea
                  id="goal"
                  value={goal}
                  onChange={event => setGoal(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder="Open Hacker News and summarize the top stories…"
                  rows={1}
                  maxLength={500}
                />
                <div className="composer-footer">
                  <span>
                    {busy ? "Running — watch the browser on the right." : "Enter to send · Shift+Enter for new line"}
                  </span>
                  {activeTask?.state === "running"
                    ? <button className="button stop-button" type="button" onClick={stop}>Stop</button>
                    : <button className="button" disabled={submitting || goal.trim().length < 3}>
                        {submitting ? "Starting…" : "Send"}
                      </button>
                  }
                </div>
              </form>
            </div>

            <section className={`live-browser${browserUrl ? " active" : ""}`} aria-label="Live browser">
              <div className="live-browser-bar">
                <div className="browser-dots" aria-hidden="true">
                  <span /><span /><span />
                </div>
                <div className="browser-address">{browserUrl || "about:blank"}</div>
                <span className="live-badge">{browserUrl ? "LIVE" : "IDLE"}</span>
              </div>
              <div className="live-browser-stage">
                <iframe
                  className="browser-vnc"
                  src={`${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000"}/browser-ui/?embed=true`}
                  title={`Browser${browserUrl ? ` — ${browserUrl}` : ""}`}
                  allow="clipboard-read; clipboard-write; fullscreen"
                />
              </div>
              {browserError && <div className="browser-connection">{browserError}</div>}
            </section>
          </div>

          {previousTasks.length > 0 && (
            <details className="panel previous-requests">
              <summary>Previous requests ({previousTasks.length})</summary>
              {previousTasks.map(task => (
                <Link className="task-row" href={`/tasks/${task.id}`} key={task.id}>
                  <span>{task.goal}</span>
                  <span className={`status${task.state === "completed" ? " success" : task.state === "failed" ? " danger" : ""}`}>
                    {task.state.replace("_", " ")}
                  </span>
                </Link>
              ))}
            </details>
          )}
        </div>
      </main>
    </div>
  );
}
