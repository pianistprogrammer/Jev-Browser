import type { ActionEnvelope, Task } from "@jev/contracts";
import type { BrowserSessionDriver } from "./browser/session.js";
import type { QwenAgent } from "./providers/qwen.js";
import { buildSnapshot } from "./providers/qwen.js";
import { validateToolArguments } from "./policy/tool-arguments.js";
import { MemoryStore } from "./store.js";

const keyAliases: Record<string, string> = {
  return: "Enter", esc: "Escape",
  arrowup: "ArrowUp", arrowdown: "ArrowDown",
  pageup: "PageUp", pagedown: "PageDown",
};

export async function runBrowserTask(
  task: Task,
  store: MemoryStore,
  browser: BrowserSessionDriver,
  agent: QwenAgent,
  signal: AbortSignal,
) {
  const event = (type: "browser" | "provider" | "state", tool: string, message: string) =>
    store.addEvent(task, type, tool, message, "allowed");

  try {
    for (let step = 0; step < 20; step++) {
      signal.throwIfAborted();

      // Build snapshot of current state and ask Qwen what to do (and with what args)
      const snapshot = buildSnapshot(task);
      const { toolCalls, text } = await agent.decide(snapshot, signal);
      signal.throwIfAborted();

      if (text) event("provider", "qwen.text", text.slice(0, 200));

      // If no tool calls, Qwen gave a text response — treat as finish
      if (!toolCalls.length) {
        if (text.trim()) {
          task.result = text;
          task.state = "completed";
          event("state", "task.completed", "Done.");
          return;
        }
        throw new Error("Qwen returned no action and no text.");
      }

      const tc = toolCalls[0];
      event("provider", "qwen.decision", `Qwen → ${tc.name}(${JSON.stringify(tc.args).slice(0, 120)})`);

      // ── Terminal actions ────────────────────────────────────────────────────
      if (tc.name === "finish") {
        if (!task.evidence?.text.trim()) {
          // Auto-extract first, then summarize
          const obs = await browser.observe();
          task.observation = obs;
          task.evidence = obs;
          event("browser", "browser.extract", `Read ${obs.title}.`);
        }
        event("state", "response.writing", "Writing the answer…");
        const result = await agent.summarize(
          task.goal,
          `Page: ${task.evidence!.url}\n${task.evidence!.text}`,
          signal,
        );
        signal.throwIfAborted();
        if (!result.trim()) throw new Error("Empty response.");
        task.result = result;
        task.state = "completed";
        event("state", "task.completed", "Done.");
        // Feed finish result back to history
        agent.recordResult(tc.id, tc.name, "Answer written successfully.");
        return;
      }

      if (tc.name === "clarify") {
        throw new Error("I couldn't complete this request with the available browser tools.");
      }

      // ── Build ActionEnvelope from tool call ─────────────────────────────────
      let envelope: ActionEnvelope;

      if (tc.name === "search_google") {
        const url = `https://www.google.com/search?q=${encodeURIComponent(tc.args.query ?? task.goal)}`;
        envelope = { kind: "browser_open", target: url, args: {}, requiresApproval: false };
      } else if (tc.name === "browser_open") {
        envelope = { kind: "browser_open", target: tc.args.url ?? "", args: {}, requiresApproval: false };
      } else if (tc.name === "browser_click") {
        envelope = { kind: "browser_click", args: { ref: tc.args.ref ?? "" }, requiresApproval: false };
      } else if (tc.name === "browser_type") {
        envelope = { kind: "browser_type", args: { ref: tc.args.ref ?? "", text: tc.args.text ?? "", submit: tc.args.submit ?? "true" }, requiresApproval: false };
      } else if (tc.name === "browser_scroll") {
        envelope = { kind: "browser_scroll", args: { pixels: tc.args.pixels ?? "650" }, requiresApproval: false };
      } else if (tc.name === "browser_key") {
        const key = keyAliases[(tc.args.key ?? "").toLowerCase()] ?? tc.args.key ?? "Enter";
        envelope = { kind: "browser_key", args: { key }, requiresApproval: false };
      } else if (tc.name === "extract") {
        envelope = { kind: "extract", args: {}, requiresApproval: false };
      } else {
        envelope = { kind: "browser_snapshot", args: {}, requiresApproval: false };
      }

      // Run through policy (validates URL safety, element refs, key names)
      let validated: ActionEnvelope;
      try {
        validated = validateToolArguments(task, envelope.kind, { target: envelope.target, args: envelope.args });
      } catch (err) {
        // Policy rejected — tell Qwen and let it recover
        const errMsg = err instanceof Error ? err.message : "Invalid arguments";
        agent.recordResult(tc.id, tc.name, `Error: ${errMsg}`);
        event("provider", "qwen.error", `Policy rejected ${tc.name}: ${errMsg}`);
        continue;
      }

      // ── Execute in the browser ──────────────────────────────────────────────
      if (validated.kind === "browser_open") {
        const host = new URL(validated.target!).hostname;
        event("state", "browser.opening", `Opening ${host}…`);
        task.evidence = undefined;
      } else {
        event("state", "browser.acting", `Using ${validated.kind.replace("browser_", "browser ")}…`);
      }

      let toolResult: string;
      try {
        task.session = await browser.execute(validated);
        signal.throwIfAborted();
        task.observation = await browser.observe();
        signal.throwIfAborted();
        task.stepsCompleted += 1;

        if (validated.kind === "browser_open") {
          task.visitedUrls = [...(task.visitedUrls ?? []), validated.target!, task.session.url];
          event("browser", validated.kind, `Opened ${task.session.url}`);
          toolResult = buildSnapshot(task);
        } else if (validated.kind === "extract") {
          if (!task.observation.text.trim()) {
            toolResult = "Error: page has no readable content.";
          } else {
            task.evidence = task.observation;
            event("browser", "browser.extract", task.evidence.stories.length
              ? `Found ${task.evidence.stories.length} stories on ${task.evidence.title}.`
              : `Read ${task.evidence.title}.`);
            toolResult = buildSnapshot(task);
          }
        } else {
          event("browser", validated.kind, `Completed on ${task.session.url}.`);
          toolResult = buildSnapshot(task);
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Browser error";
        event("browser", "browser.error", errMsg);
        toolResult = `Error: ${errMsg}. Current URL: ${task.session?.url ?? "unknown"}`;
      }

      // Feed result back to Qwen so it sees what happened
      agent.recordResult(tc.id, tc.name, toolResult);
    }

    throw new Error("Reached the step limit. Try a more specific request.");
  } catch (error) {
    if (signal.aborted) return;
    task.state = "failed";
    task.error = error instanceof Error ? error.message : "The browser request failed.";
    store.addEvent(task, "state", "task.failed", task.error, "blocked");
  }
}
