import { describe, expect, it, vi } from "vitest";
import type { BrowserSession, PageEvidence } from "@jev/contracts";
import { buildServer } from "../src/server.js";
import { loadConfig } from "../src/config.js";
import type { BrowserSessionDriver } from "../src/browser/session.js";
import { QwenAgent } from "../src/providers/qwen.js";

const page: PageEvidence = {
  url: "https://news.ycombinator.com/newest", title: "New Links | Hacker News",
  text: "Hacker News newest. Story one. Story two.",
  links: [], stories: [{ title: "Story one", url: "https://example.com/one" }],
  elements: [
    { ref: "e1", label: "Search", kind: "input", inputType: "search", disabled: false },
    { ref: "e2", label: "https://example.com/story", kind: "link", disabled: false },
  ],
  capturedAt: new Date().toISOString(),
};

function makeAgent(steps: Array<{ name: string; args?: Record<string, string> }>): QwenAgent {
  let i = 0;
  const agent = new QwenAgent("http://unused", "unused");
  vi.spyOn(agent, "decide").mockImplementation(async () => {
    const step = steps[Math.min(i++, steps.length - 1)];
    return {
      toolCalls: [{ id: `tc-${i}`, name: step.name, args: step.args ?? {} }],
      text: "",
    };
  });
  vi.spyOn(agent, "recordResult").mockImplementation(() => {});
  vi.spyOn(agent, "summarize").mockResolvedValue("Here are the newest stories from Hacker News.");
  return agent;
}

function fixtures(agentOverride?: QwenAgent) {
  const session: BrowserSession = { id: "browser", url: page.url, title: page.title, connected: true, screenshot: "data:image/jpeg;base64,/9j/", lastUpdatedAt: page.capturedAt };
  const execute = vi.fn(async () => ({ ...session }));
  const browser: BrowserSessionDriver = {
    open: async () => session, execute, observe: async () => ({ ...page }),
    screenshot: async () => Buffer.from([255, 216, 255]),
    status: () => ({ active: true, url: page.url, title: page.title }),
    close: async () => {},
  };
  const agent = agentOverride ?? makeAgent([
    { name: "search_google", args: { query: "hacker news" } },
    { name: "extract" },
    { name: "finish" },
  ]);
  return { ...buildServer({ browser, agent, logger: false, config: loadConfig() }), execute, agent };
}

async function start(app: ReturnType<typeof buildServer>["app"]) {
  const created = await app.inject({ method: "POST", url: "/api/tasks", payload: { goal: "open hacker news and show me the latest news" } });
  expect(created.statusCode).toBe(201);
  const task = created.json().task;
  const run = await app.inject({ method: "POST", url: `/api/tasks/${task.id}/run`, payload: { expectedVersion: task.version } });
  expect(run.statusCode).toBe(202);
  return task.id as string;
}

describe("QwenAgent native tool-calling workflow", () => {
  it("completes search → extract → finish", async () => {
    const { app, store, execute } = fixtures();
    try {
      const id = await start(app);
      await vi.waitFor(() => expect(store.tasks.get(id)?.state).toBe("completed"));
      expect(execute).toHaveBeenCalledWith(expect.objectContaining({ kind: "browser_open", target: expect.stringContaining("google.com") }));
      expect(execute).toHaveBeenCalledWith(expect.objectContaining({ kind: "extract" }));
      expect(store.tasks.get(id)?.result).toBeTruthy();
    } finally { await app.close(); }
  });

  it("feeds tool result back to agent after each action", async () => {
    const agent = makeAgent([
      { name: "search_google", args: { query: "hacker news" } },
      { name: "extract" },
      { name: "finish" },
    ]);
    const { app, store } = fixtures(agent);
    try {
      const id = await start(app);
      await vi.waitFor(() => expect(store.tasks.get(id)?.state).toBe("completed"));
      expect(agent.recordResult).toHaveBeenCalled();
    } finally { await app.close(); }
  });

  it("recovers when policy rejects an action — continues to next step", async () => {
    const agent = makeAgent([
      { name: "browser_click", args: { ref: "nonexistent-ref" } }, // will fail policy
      { name: "search_google", args: { query: "test" } },
      { name: "extract" },
      { name: "finish" },
    ]);
    const { app, store } = fixtures(agent);
    try {
      const id = await start(app);
      await vi.waitFor(() => expect(store.tasks.get(id)?.state).toBe("completed"));
    } finally { await app.close(); }
  });

  it("auto-extracts when finish called without evidence", async () => {
    const { app, store } = fixtures(makeAgent([{ name: "finish" }]));
    try {
      const id = await start(app);
      await vi.waitFor(() => expect(["completed", "failed"].includes(store.tasks.get(id)?.state ?? "")).toBe(true));
      expect(store.tasks.get(id)?.state).toBe("completed");
    } finally { await app.close(); }
  });

  it("cancels cleanly", async () => {
    let release!: () => void;
    const blocked = new Promise<void>(r => { release = r; });
    const agent = new QwenAgent("http://unused", "unused");
    vi.spyOn(agent, "decide").mockImplementation(async () => { await blocked; return { toolCalls: [], text: "" }; });
    const { app, store } = fixtures(agent);
    try {
      const id = await start(app);
      const cancel = await app.inject({ method: "POST", url: `/api/tasks/${id}/cancel`, payload: {} });
      expect(cancel.statusCode).toBe(202);
      release();
      await vi.waitFor(() => expect(store.tasks.get(id)?.state).toBe("cancelled"));
    } finally { await app.close(); }
  });

  it("rejects stale version", async () => {
    const { app } = fixtures();
    try {
      const created = await app.inject({ method: "POST", url: "/api/tasks", payload: { goal: "test" } });
      const r = await app.inject({ method: "POST", url: `/api/tasks/${created.json().task.id}/run`, payload: { expectedVersion: 999 } });
      expect(r.statusCode).toBe(409);
    } finally { await app.close(); }
  });
});
