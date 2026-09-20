"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../../api";
import type { Task } from "@jev/contracts";
import { TaskResult } from "../../task-result";

export default function TaskDetail({ params }: { params: Promise<{ taskId: string }> }) {
  const [task, setTask] = useState<Task | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    void params.then(({ taskId }) => {
      const poll = async () => {
        try {
          const result = await api.getTask(taskId);
          if (stopped) return;
          setTask(result.task);
          if (result.task.state === "running") timer = setTimeout(poll, 750);
        } catch { if (!stopped) setError("I couldn’t load that request."); }
      };
      void poll();
    });
    return () => { stopped = true; clearTimeout(timer); };
  }, [params]);
  return <div className="shell">
    <header className="topbar"><Link className="brand" href="/"><span className="logo">J</span> JEV Browser</Link><Link href="/">Back to workspace</Link></header>
    <main className="main">
      {error && <div className="banner">{error}</div>}
      {!task ? <p>Loading request…</p> : <section className="detail-grid">
        <div className="panel"><TaskResult task={task} /></div>
        <div className="browser"><div className="browser-bar">{task.session.url}</div>
          {task.session.connected ? <img src={`/api/tasks/${task.id}/screenshot?v=${task.version}`} alt={`Browser snapshot of ${task.session.title}`} /> : <div className="empty">The browser has not opened a page for this request.</div>}
        </div>
      </section>}
    </main>
  </div>;
}
