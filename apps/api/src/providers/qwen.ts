import type { Task } from "@jev/contracts";

// The tool schemas Qwen sees — it picks one and fills the arguments natively
const BROWSER_TOOLS = [
  {
    type: "function",
    function: {
      name: "search_google",
      description: "Search Google for any information, news, results, or facts. Use this as the first action for any research request.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_open",
      description: "Navigate directly to a specific HTTPS URL. Prefer clicking Google result links over direct navigation — news sites often block direct access.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Full HTTPS URL" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_click",
      description: "Click a visible link or button. Use this to open Google search results — more reliable than direct navigation.",
      parameters: {
        type: "object",
        properties: {
          ref: { type: "string", description: "Element ref from the visible elements list, e.g. e3" },
        },
        required: ["ref"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_type",
      description: "Type text into a visible input or search field and submit it.",
      parameters: {
        type: "object",
        properties: {
          ref: { type: "string", description: "Element ref of the input field" },
          text: { type: "string", description: "Text to type" },
          submit: { type: "string", description: "'true' to press Enter after typing, 'false' otherwise" },
        },
        required: ["ref", "text", "submit"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_scroll",
      description: "Scroll the page to reveal more content.",
      parameters: {
        type: "object",
        properties: {
          pixels: { type: "string", description: "Pixels to scroll, e.g. '650'" },
        },
        required: ["pixels"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_key",
      description: "Press a navigation key. Only use when no input field is available. Key must be: Enter, Escape, Tab, ArrowUp, ArrowDown, PageUp, PageDown.",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string", description: "Key name" },
        },
        required: ["key"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "extract",
      description: "Read and save the current page as evidence. Always do this after navigating to a page before taking any further action.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "finish",
      description: "Write the final answer from the extracted evidence. Only call this when the evidence contains what the user asked for.",
      parameters: { type: "object", properties: {} },
    },
  },
];

export type ToolCall = {
  id: string;
  name: string;
  args: Record<string, string>;
};

export type QwenDecision = {
  toolCalls: ToolCall[];
  text: string;
};

const SYSTEM_PROMPT = `You are a browser automation agent controlling a real Chromium browser.
Each turn you see the current page state and call one browser tool to advance the task.
Rules:
- Always call extract after opening a page before doing anything else.
- Prefer browser_click to open Google results over browser_open — direct navigation often gets blocked.
- If a page is blocked or unhelpful, go back to results and click a different link.
- Call finish only when you have actually extracted the information the user asked for.`;

export class QwenAgent {
  // Full conversation history — Qwen sees every tool call and result
  private messages: Array<{ role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string }> = [];

  constructor(private readonly baseUrl: string, private readonly model: string) {}

  async decide(snapshot: string, signal?: AbortSignal): Promise<QwenDecision> {
    this.messages.push({ role: "user", content: snapshot });

    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...this.messages],
        tools: BROWSER_TOOLS,
        tool_choice: "auto",
        stream: false,
        max_tokens: 512,
        temperature: 0.2,
        chat_template_kwargs: { enable_thinking: false },
      }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(90000)]) : AbortSignal.timeout(90000),
    });

    if (!response.ok) throw new Error(`Qwen request failed (HTTP ${response.status})`);
    const body = await response.json() as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
        };
      }>;
    };

    const message = body.choices?.[0]?.message;
    if (!message) throw new Error("Qwen returned no message.");

    const toolCalls: ToolCall[] = (message.tool_calls ?? []).map(tc => ({
      id: tc.id,
      name: tc.function.name,
      args: (() => {
        try { return JSON.parse(tc.function.arguments) as Record<string, string>; }
        catch { return {}; }
      })(),
    }));

    // Record the assistant turn in history
    this.messages.push({
      role: "assistant",
      content: message.content ?? null,
      tool_calls: message.tool_calls,
    });

    return { toolCalls, text: message.content ?? "" };
  }

  // Feed each tool result back as a tool message — exactly how Jarvis does it
  recordResult(toolCallId: string, toolName: string, result: string) {
    this.messages.push({
      role: "tool",
      tool_call_id: toolCallId,
      content: result,
    });
    // Also push a placeholder tool_call_id for tools that don't return an id
    void toolName;
  }

  // Force a text summary — called at finish with tool_choice: none
  async summarize(goal: string, evidence: string, signal?: AbortSignal): Promise<string> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: "Write a clear, concise answer using only the page content provided. Plain text, no markdown. Do not invent facts." },
          { role: "user", content: `Request: ${goal}\n\n${evidence.slice(0, 8000)}` },
        ],
        stream: false,
        max_tokens: 1024,
        temperature: 0.2,
        chat_template_kwargs: { enable_thinking: false },
      }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(90000)]) : AbortSignal.timeout(90000),
    });
    if (!response.ok) throw new Error(`Qwen summarize failed (HTTP ${response.status})`);
    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    return body.choices?.[0]?.message?.content?.trim() ?? "";
  }
}

// Build a snapshot string from the task state — this is what Qwen sees each turn
export function buildSnapshot(task: Task): string {
  const lines: string[] = [];

  if (!task.observation) {
    lines.push(`Goal: ${task.goal}`);
    lines.push("Browser: not yet opened.");
    return lines.join("\n");
  }

  lines.push(`Goal: ${task.goal}`);
  lines.push(`URL: ${task.observation.url}`);
  lines.push(`Title: ${task.observation.title}`);

  if (task.observation.elements?.length) {
    lines.push("Elements:");
    task.observation.elements.slice(0, 50).forEach(e => {
      lines.push(`  ${e.ref} [${e.kind}${e.inputType ? `/${e.inputType}` : ""}] ${e.label.slice(0, 120)}`);
    });
  }

  if (task.evidence?.text) {
    lines.push(`\nPage text (${task.evidence.url}):`);
    lines.push(task.evidence.text.slice(0, 3000));
  }

  return lines.join("\n");
}
