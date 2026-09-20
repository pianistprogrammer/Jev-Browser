import type { Task } from "@jev/contracts";
import type { ActionCandidate } from "./providers/types.js";
import { validateNavigationUrl } from "./policy/navigation.js";

// Code supplies arguments. Jev alone selects which of these actions to execute.
export function buildCandidates(task: Task): ActionCandidate[] {
  const candidates: ActionCandidate[] = [];
  const seen = new Set<string>();
  const addUrl = (id: string, description: string, raw: string) => {
    let url: string;
    try { url = validateNavigationUrl(raw, false).href; } catch { return; }
    if (seen.has(url) || task.visitedUrls?.includes(url)) return;
    seen.add(url);
    candidates.push({ id, description: `${description}: ${url}`, action: { kind: "navigate", target: url, args: {}, requiresApproval: false } });
  };
  if (!task.stepsCompleted) {
    if (task.startUrl !== "about:blank") addUrl("starting_page", "Open the user's explicit starting page", task.startUrl);
    const explicitUrls = task.goal.match(/https?:\/\/[^\s<>"']+|\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>"']*)?/gi) ?? [];
    explicitUrls.forEach((url, index) => addUrl(`url_${index}`, "Open the URL written in the request", (url.startsWith("http") ? url : `https://${url}`).replace(/[.,!?;)]+$/, "")));
    // Named-site destinations are options, not keyword-based tool selection.
    addUrl("hn_latest", "Open Hacker News newest submissions, ordered newest first", "https://news.ycombinator.com/newest");
    addUrl("hn_top", "Open Hacker News ranked front page / top stories", "https://news.ycombinator.com/");
    addUrl("wikipedia", "Search Wikipedia for the user's request", `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(task.goal)}`);
    addUrl("web_search", "Search the web for the request when no explicit destination matches", `https://www.google.com/search?q=${encodeURIComponent(task.goal)}`);
  }
  if (task.observation) {
    if (!task.evidence || task.evidence.url !== task.observation.url) {
      candidates.push({ id: "extract", description: "Read and save the current page's visible text and story links as evidence; do this if the correct page is now open.", action: { kind: "extract", args: {}, requiresApproval: false } });
    }
    task.observation.links.slice(0, 45).forEach((link, index) => addUrl(`link_${index}`, `Follow visible page link '${link.title}'`, link.url));
    if (task.evidence?.text.trim() && task.evidence.url === task.observation.url) {
      candidates.push({ id: "finish", description: "The saved page evidence fulfills the user's request. Finish browser work and ask the local model to write the answer.", action: { kind: "finish", args: {}, requiresApproval: false } });
    }
  }
  candidates.push({ id: "clarify", description: "The request needs clarification, the page is blocked, or the required action (login, typing, posting or purchase) is not supported by these read-only tools.", action: { kind: "clarify", args: {}, requiresApproval: false } });
  return candidates;
}
