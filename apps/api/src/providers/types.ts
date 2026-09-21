import type { ActionEnvelope, Task } from "@jev/contracts";
export type ActionCandidate = { id: string; description: string; action: ActionEnvelope };
export type BrowserToolArguments = { target?: string; args: Record<string, string> };
