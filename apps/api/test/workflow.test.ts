import { describe, expect, it, vi } from "vitest";
import type { BrowserSession, PageEvidence } from "@jev/contracts";
import { buildServer } from "../src/server.js";
import { loadConfig } from "../src/config.js";
import { buildCandidates } from "../src/candidates.js";
import { MemoryStore } from "../src/store.js";
import type { BrowserSessionDriver } from "../src/browser/session.js";
import type { JevProvider, ResponseWriter } from "../src/providers/types.js";

const page: PageEvidence = {
  url: "https://news.ycombinator.com/newest", title: "New Links | Hacker News",
  text: "Hacker News newest. Story one. Story two.",
  links: [], stories: [{ title: "Story one", url: "https://example.com/one" }], capturedAt: new Date().toISOString(),
};
function fixtures(providerOverride?: JevProvider, writerOverride?: ResponseWriter) {
  const session: BrowserSession = { id: "browser", url: page.url, title: page.title, connected: true, screenshot: "data:image/jpeg;base64,/9j/", lastUpdatedAt: page.capturedAt };
  const execute = vi.fn(async () => ({ ...session }));
  const browser: BrowserSessionDriver = {
    open: async () => ({ ...session }), execute, observe: async () => ({ ...page }),
    screenshot: async () => Buffer.from([255, 216, 255]), status: () => ({ active: true, url: page.url, title: page.title }), close: async () => {},
  };
  const provider: JevProvider = providerOverride ?? { decide: vi.fn(async task => ({
    candidateId: !task.observation ? "hn_latest" : !task.evidence ? "extract" : "finish",
    confidence: 0.99, goalSatisfied: task.evidence ? 0.99 : 0.01,
  })) };
  const writer = writerOverride ?? { summarize: vi.fn(async () => "Here are the newest stories from Hacker News.") };
  return { ...buildServer({ browser, provider, writer, logger: false, config: { ...loadConfig(), providerMode: "openrouter" } }), execute, writer };
}
async function start(app: ReturnType<typeof buildServer>["app"]) {
  const created = await app.inject({ method: "POST", url: "/api/tasks", payload: { goal: "open hacker news and show me the latest new" } });
  expect(created.statusCode).toBe(201);
  const task = created.json().task;
  const response = await app.inject({ method: "POST", url: `/api/tasks/${task.id}/run`, payload: { expectedVersion: task.version } });
  expect(response.statusCode).toBe(202);
  expect(response.json().task.state).toBe("running");
  return task.id as string;
}

describe("real browser workflow orchestration", () => {
  it("does not complete after two steps; waits for verified evidence and the final response", async () => {
    let resolve!: (value: string) => void;
    const summarize = vi.fn(() => new Promise<string>(done => { resolve = done; }));
    const { app, store, execute } = fixtures(undefined, { summarize });
    try {
      const id = await start(app);
      await vi.waitFor(() => expect(summarize).toHaveBeenCalledOnce());
      expect(store.tasks.get(id)?.stepsCompleted).toBe(2);
      expect(store.tasks.get(id)?.state).toBe("running");
      expect(execute.mock.calls[0][0]).toMatchObject({ kind: "navigate", target: page.url });
      expect(store.tasks.get(id)?.evidence?.stories[0].title).toBe("Story one");
      resolve("Here are the newest stories.");
      await vi.waitFor(() => expect(store.tasks.get(id)?.state).toBe("completed"));
      expect(store.tasks.get(id)?.result).toBe("Here are the newest stories.");
    } finally { await app.close(); }
  });
  it("rejects early finish before evidence and never writes a success response", async () => {
    const { app, store, execute, writer } = fixtures({ decide: async () => ({ candidateId: "finish", confidence: 1, goalSatisfied: 1 }) });
    try {
      const id = await start(app);
      await vi.waitFor(() => expect(store.tasks.get(id)?.state).toBe("failed"));
      expect(execute).not.toHaveBeenCalled();
      expect(writer.summarize).not.toHaveBeenCalled();
      expect(store.tasks.get(id)?.result).toBeUndefined();
    } finally { await app.close(); }
  });
  it("surfaces provider failure without falling back to fake completion", async () => {
    const { app, store, execute } = fixtures({ decide: async () => { throw new Error("OpenRouter rejected the API key (401)."); } });
    try {
      const id = await start(app);
      await vi.waitFor(() => expect(store.tasks.get(id)?.state).toBe("failed"));
      expect(store.tasks.get(id)?.error).toContain("401");
      expect(execute).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });
  it("preserves browser findings when the response model fails", async () => {
    const { app, store } = fixtures(undefined, { summarize: async () => { throw new Error("Ollama is unavailable."); } });
    try {
      const id = await start(app);
      await vi.waitFor(() => expect(store.tasks.get(id)?.state).toBe("failed"));
      expect(store.tasks.get(id)?.evidence?.url).toBe(page.url);
      expect(store.tasks.get(id)?.result).toBeUndefined();
    } finally { await app.close(); }
  });
  it("does not report success after cancellation and keeps a busy browser locked", async () => {
    let resolve!: (value: string) => void;
    const summarize = vi.fn(() => new Promise<string>(done => { resolve = done; }));
    const { app, store } = fixtures(undefined, { summarize });
    try {
      const id = await start(app);
      await vi.waitFor(() => expect(summarize).toHaveBeenCalledOnce());
      const task = store.tasks.get(id)!;
      const rerun = await app.inject({ method: "POST", url: `/api/tasks/${id}/run`, payload: { expectedVersion: task.version } });
      expect(rerun.statusCode).toBe(409);
      await app.inject({ method: "POST", url: `/api/tasks/${id}/cancel`, payload: {} });
      resolve("This must not appear as a successful answer.");
      await new Promise(done => setImmediate(done));
      expect(task.state).toBe("cancelled");
      expect(task.result).toBeUndefined();
    } finally { await app.close(); }
  });
  it("supplies separate newest and ranked destinations, without exposing finish prematurely", () => {
    const task = new MemoryStore().create("Show Hacker News latest news", "about:blank", "openrouter");
    const candidates = buildCandidates(task);
    expect(candidates.find(c => c.id === "hn_latest")?.action.target).toBe(page.url);
    expect(candidates.find(c => c.id === "hn_top")?.action.target).toBe("https://news.ycombinator.com/");
    expect(candidates.some(c => c.id === "finish")).toBe(false);
  });
});
