import type { Task } from "@jev/contracts";
import type { BrowserSessionDriver } from "./browser/session.js";
import type { JevProvider, ResponseWriter } from "./providers/types.js";
import { buildCandidates } from "./candidates.js";
import { MemoryStore } from "./store.js";

export async function runBrowserTask(task: Task, store: MemoryStore, browser: BrowserSessionDriver, provider: JevProvider, writer: ResponseWriter, signal: AbortSignal) {
  const event = (type: "browser" | "provider" | "state", tool: string, message: string) => store.addEvent(task, type, tool, message, "allowed");
  try {
    for (let step = 0; step < 10; step++) {
      signal.throwIfAborted();
      const candidates = buildCandidates(task);
      const decision = await provider.decide(task, candidates, signal);
      signal.throwIfAborted();
      const candidate = candidates.find(c => c.id === decision.candidateId);
      if (!candidate || !Number.isFinite(decision.confidence) || decision.confidence < 0.6) throw new Error("I couldn't confidently choose an available action. Please clarify what you want to do.");
      event("provider", "jev.decision", `Jev selected ${candidate.id} (${Math.round(decision.confidence * 100)}% confidence).`);
      const action = candidate.action;
      if (action.kind === "clarify") throw new Error("I couldn't finish this request with the available browser tools. Try giving me a specific page to open and read.");
      if (action.kind === "finish") {
        if (!task.evidence?.text.trim() || task.evidence.url !== task.session.url || !Number.isFinite(decision.goalSatisfied) || decision.goalSatisfied < 0.8) {
          throw new Error("I reached a page, but couldn't verify that it answers your request. The task has not been marked complete.");
        }
        event("state", "response.writing", "Putting together what I found…");
        const result = await writer.summarize(task, signal);
        signal.throwIfAborted();
        if (!result.trim()) throw new Error("The response was empty. The browser findings are available below.");
        task.result = result;
        task.state = "completed";
        event("state", "task.completed", "Your findings are ready.");
        return;
      }
      // Policy is code-owned. Neither model can authorize mutations.
      if (action.requiresApproval || !["navigate", "extract"].includes(action.kind)) throw new Error("This action isn't supported by the current read-only browser tools.");
      if (action.kind === "navigate") {
        const target = new URL(action.target!);
        const name = target.hostname === "news.ycombinator.com" ? `Hacker News${target.pathname === "/newest" ? " — newest stories" : ""}` : target.hostname;
        event("state", "browser.opening", `Opening ${name}…`);
        task.evidence = undefined;
      } else event("state", "browser.reading", `Reading ${task.session.title || "the page"}…`);
      task.session = await browser.execute(action);
      signal.throwIfAborted();
      task.observation = await browser.observe();
      signal.throwIfAborted();
      task.stepsCompleted += 1;
      if (action.kind === "navigate") {
        task.visitedUrls = [...(task.visitedUrls ?? []), action.target!, task.session.url];
        event("browser", "browser.navigate", `Opened ${task.session.url}`);
      } else {
        if (!task.observation.text.trim()) throw new Error("The page returned no readable content.");
        task.evidence = task.observation;
        event("browser", "browser.extract", task.evidence.stories.length ? `Found ${task.evidence.stories.length} stories on ${task.evidence.title}.` : `Read ${task.evidence.title}.`);
      }
    }
    throw new Error("I reached the browser step limit before verifying the answer. Please narrow the request.");
  } catch (error) {
    if (signal.aborted) return;
    task.state = "failed";
    task.error = error instanceof Error ? error.message : "The browser request failed.";
    store.addEvent(task, "state", "task.failed", task.error, "blocked");
  }
}
