import type { ActionEnvelope, Task } from "@jev/contracts";
export type ActionCandidate = { id: string; description: string; action: ActionEnvelope };
export type JevDecision = { candidateId: string; confidence: number; goalSatisfied: number };
export interface JevProvider {
  decide(task: Task, candidates: ActionCandidate[], signal?: AbortSignal): Promise<JevDecision>;
}
export interface ResponseWriter {
  summarize(task: Task, signal?: AbortSignal): Promise<string>;
}
