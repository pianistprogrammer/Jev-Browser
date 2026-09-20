"use client";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../api";
import { taskSummary, type Task, type TaskSummary } from "@jev/contracts";
import { TaskResult } from "./task-result";

export default function Workspace() {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [goal, setGoal] = useState("");
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [browserUrl, setBrowserUrl] = useState("");
  const [frame, setFrame] = useState("");
  const [browserError, setBrowserError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [connection, setConnection] = useState("Connecting…");
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
    }).catch(() => { if (!stopped) setMessage("I can’t reach the browser service. Check that the app is running."); });
    fetch("/api/health").then(r => r.json()).then(health => {
      if (!stopped) setConnection(health.providerMode === "openrouter" ? "Jev + local Gemma" : "Demo mode · requests disabled");
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
      } catch { if (!stopped) setMessage("Connection interrupted. Reconnecting to your request…"); }
      if (!stopped) timer = setTimeout(poll, 650);
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [activeTask?.id, activeTask?.state]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let imageUrl = "";
    const controller = new AbortController();
    const poll = async () => {
      try {
        const status = await fetch("/api/browser/status", { cache: "no-store", signal: controller.signal }).then(r => {
          if (!r.ok) throw new Error("Browser unavailable");
          return r.json();
        });
        if (stopped) return;
        if (status.active) {
          setBrowserUrl(status.url);
          const response = await fetch("/api/browser/screenshot", { cache: "no-store", signal: controller.signal });
          if (response.ok) {
            const blob = await response.blob();
            if (stopped) return;
            const next = URL.createObjectURL(blob);
            const previous = imageUrl;
            imageUrl = next;
            setFrame(next);
            setBrowserError("");
            if (previous) URL.revokeObjectURL(previous);
          } else setBrowserError("The page is loading…");
        } else {
          setFrame("");
          setBrowserUrl("");
        }
      } catch { if (!stopped) setBrowserError("Reconnecting to the browser…"); }
      if (!stopped) timer = setTimeout(poll, 900);
    };
    void poll();
    return () => { stopped = true; controller.abort(); clearTimeout(timer); if (imageUrl) URL.revokeObjectURL(imageUrl); };
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
      setMessage(error instanceof Error ? error.message : "I couldn’t start that request.");
    } finally { setSubmitting(false); }
  }
  async function stop() {
    if (!activeTask) return;
    try { updateTask((await api.cancelTask(activeTask.id)).task); }
    catch (error) { setMessage(error instanceof Error ? error.message : "I couldn’t stop the request."); }
  }

  return <div className="shell">
    <header className="topbar">
      <Link className="brand" href="/"><span className="logo">J</span> JEV Browser</Link>
      <div className="topmeta"><Link href="/settings">Settings</Link><span>{connection}</span></div>
    </header>
    <main className="main conversation-workspace">
      <section className="operator-workspace">
        <div className="conversation-column">
          <div className="workspace-intro"><div className="eyebrow">YOUR BROWSER ASSISTANT</div><h1>What would you like to explore?</h1><p>Ask naturally. Watch the browser, then read what I find.</p></div>
          {activeTask && <TaskResult task={activeTask} />}
          {message && <div className="banner" role="alert">{message}</div>}
          <form className="conversation-composer" onSubmit={submit}>
            <label className="sr-only" htmlFor="goal">Your request</label>
            <textarea id="goal" value={goal} onChange={event => setGoal(event.target.value)}
              onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}
              placeholder="Open Hacker News and show me the latest news…" rows={3} maxLength={500} />
            <div className="composer-footer"><span>{busy ? "You can watch me work on the right." : "Enter to send · Shift + Enter for a new line"}</span>
              {activeTask?.state === "running" ? <button className="button stop-button" type="button" onClick={stop}>Stop</button>
                : <button className="button" disabled={submitting || goal.trim().length < 3}>{submitting ? "Starting…" : "Send ↗"}</button>}
            </div>
          </form>
        </div>
        <section className={`live-browser ${frame ? "active" : ""}`} aria-label="Live browser">
          <div className="live-browser-bar"><div className="browser-dots" aria-hidden="true"><span /><span /><span /></div>
            <div className="browser-address">{browserUrl || "Your browser"}</div><span className="live-badge">{frame ? "LIVE" : "READY"}</span>
          </div>
          <div className="live-browser-stage">
            {frame ? <img src={frame} alt={`Live browser at ${browserUrl}`} /> : <div className="browser-empty-state"><span className="browser-empty-icon">↗</span><strong>{busy ? "Opening your browser…" : "Let’s go somewhere."}</strong><p>{busy ? "I’m finding the right page for your request." : "Tell me what you’d like to find. The page will appear here."}</p></div>}
          </div>
          {browserError && <div className="browser-connection">{browserError}</div>}
        </section>
      </section>
      {tasks.length > 1 && <details className="panel previous-requests"><summary>Previous requests</summary>{tasks.filter(t => t.id !== activeTask?.id).map(task =>
        <Link className="task-row" href={`/tasks/${task.id}`} key={task.id}><span>{task.goal}</span><span className={`status ${task.state === "completed" ? "success" : task.state === "failed" ? "danger" : ""}`}>{task.state.replace("_", " ")}</span></Link>
      )}</details>}
    </main>
  </div>;
}
