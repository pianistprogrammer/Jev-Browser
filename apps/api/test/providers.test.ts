import { afterEach, describe, expect, it, vi } from "vitest";
import { QwenAgent, buildSnapshot } from "../src/providers/qwen.js";
import { MemoryStore } from "../src/store.js";

afterEach(() => vi.unstubAllGlobals());

describe("QwenAgent", () => {
  it("sends tool schemas and parses a tool_call response", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: null,
          tool_calls: [{ id: "tc1", function: { name: "search_google", arguments: JSON.stringify({ query: "premier league results" }) } }],
        },
      }],
    })));
    vi.stubGlobal("fetch", fetchMock);
    const task = new MemoryStore().create("premier league results", "about:blank");
    const agent = new QwenAgent("http://127.0.0.1:8180/v1", "qwen-local");
    const { toolCalls } = await agent.decide(buildSnapshot(task));
    expect(toolCalls[0].name).toBe("search_google");
    expect(toolCalls[0].args.query).toBe("premier league results");
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.tools).toBeDefined();
    expect(body.tool_choice).toBe("auto");
    expect(body.chat_template_kwargs.enable_thinking).toBe(false);
  });

  it("records tool result as a tool message in history", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: null, tool_calls: [{ id: "tc1", function: { name: "extract", arguments: "{}" } }] } }],
    })));
    vi.stubGlobal("fetch", fetchMock);
    const task = new MemoryStore().create("test", "about:blank");
    const agent = new QwenAgent("http://127.0.0.1:8180/v1", "qwen-local");
    await agent.decide(buildSnapshot(task));
    agent.recordResult("tc1", "extract", "page content here");
    await agent.decide(buildSnapshot(task));
    const body = JSON.parse(String(fetchMock.mock.calls[1][1].body));
    const toolMsg = body.messages.find((m: { role: string }) => m.role === "tool");
    expect(toolMsg).toBeDefined();
    expect(toolMsg.content).toBe("page content here");
  });

  it("handles text-only response with no tool calls", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({
      choices: [{ message: { content: "Here is the answer.", tool_calls: [] } }],
    })));
    const task = new MemoryStore().create("test", "about:blank");
    const { toolCalls, text } = await new QwenAgent("http://127.0.0.1:8180/v1", "qwen-local").decide(buildSnapshot(task));
    expect(toolCalls).toHaveLength(0);
    expect(text).toBe("Here is the answer.");
  });

  it("buildSnapshot includes elements and evidence when present", () => {
    const task = new MemoryStore().create("test query", "about:blank");
    task.observation = {
      url: "https://google.com", title: "Google", text: "search page",
      links: [], stories: [], elements: [{ ref: "e1", label: "Search", kind: "input", inputType: "search", disabled: false }],
      capturedAt: new Date().toISOString(),
    };
    task.evidence = { ...task.observation, text: "Arsenal won 2-1" };
    const snap = buildSnapshot(task);
    expect(snap).toContain("e1");
    expect(snap).toContain("Arsenal won 2-1");
    expect(snap).toContain("test query");
  });
});
