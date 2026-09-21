import type { Approval, BrowserSession, StepEvent, Task } from "@jev/contracts";
const now = () => new Date().toISOString();
export class MemoryStore {
  tasks = new Map<string, Task>();
  create(goal: string, startUrl: string): Task {
    const timestamp = now();
    const session: BrowserSession = { id: crypto.randomUUID(), url: "about:blank", title: "Browser not opened yet", screenshot: "", connected: false, lastUpdatedAt: timestamp };
    const task: Task = {
      id: crypto.randomUUID(), goal, startUrl, state: "draft", providerMode: "openrouter",
      model: "qwen-local", version: 0, stepsCompleted: 0,
      createdAt: timestamp, updatedAt: timestamp, session, events: [], visitedUrls: [],
    };
    this.tasks.set(task.id, task);
    return task;
  }
  addEvent(task: Task, type: StepEvent["type"], tool: string, summary: string, policy: StepEvent["policy"]): void {
    task.version += 1;
    task.updatedAt = now();
    task.events.push({ id: crypto.randomUUID(), taskId: task.id, version: task.version, type, tool, summary, policy, occurredAt: task.updatedAt, correlationId: crypto.randomUUID() });
  }
}
