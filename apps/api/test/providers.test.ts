import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenRouterJevProvider } from "../src/providers/openrouter.js";
import { OllamaResponseWriter } from "../src/providers/ollama.js";
import { MemoryStore } from "../src/store.js";
import { buildCandidates } from "../src/candidates.js";

afterEach(() => vi.unstubAllGlobals());
describe("classifier and response model separation", () => {
  it("uses typed decisions and validates the chosen candidate", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ answers: {
      next_action: { type: "choice", choice: "hn_latest", probabilities: { hn_latest: 0.99 } },
      goal_satisfied: { type: "noul", noul: 0.01 },
    } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const task = new MemoryStore().create("Hacker News latest", "about:blank", "openrouter");
    const provider = new OpenRouterJevProvider("test-key", "https://openrouter.ai/api/v1", "typesafe/jev-1.13");
    expect((await provider.decide(task, buildCandidates(task))).candidateId).toBe("hn_latest");
    const [url, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/alpha/decisions");
    const body = JSON.parse(String(request.body));
    expect(body.model).toBe("typesafe/jev-1.13");
    expect(body.questions.next_action.type).toBe("choice");
    expect(body.messages).toBeUndefined();
  });
  it("rejects a fabricated choice outside the available tools", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ answers: {
      next_action: { type: "choice", choice: "run_shell", probabilities: { run_shell: 1 } }, goal_satisfied: { type: "noul", noul: 1 },
    } })));
    const task = new MemoryStore().create("Read Hacker News", "about:blank", "openrouter");
    await expect(new OpenRouterJevProvider("test", "https://openrouter.ai/api/v1", "typesafe/jev-1.13").decide(task, buildCandidates(task))).rejects.toThrow("unavailable");
  });
  it("gives Gemma evidence but no tool definitions, and disables thinking for a fast reply", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ message: { content: "Here are the newest stories." } })));
    vi.stubGlobal("fetch", fetchMock);
    const task = new MemoryStore().create("Hacker News latest", "about:blank", "openrouter");
    task.evidence = { title: "New Links", url: "https://news.ycombinator.com/newest", text: "Observed story", stories: [], links: [], capturedAt: new Date().toISOString() };
    await new OllamaResponseWriter("http://127.0.0.1:11434", "gemma4:e2b").summarize(task);
    const [, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(request.body));
    expect(body.model).toBe("gemma4:e2b");
    expect(body.tools).toBeUndefined();
    expect(body.think).toBe(false);
    expect(body.messages[1].content).toContain("Observed story");
  });
});
