import type {
  ApprovalDecision,
  BrowserSession,
  ProviderSettings,
  ProviderMode,
  StepEvent,
  Task,
  TaskSummary,
} from "@jev/contracts";
export interface ApiClient {
  listTasks(): Promise<{ items: TaskSummary[] }>;
  createTask(input: {
    goal: string;
    startUrl?: string;
    providerMode?: ProviderMode;
  }): Promise<{ task: Task; session: BrowserSession }>;
  getTask(
    id: string,
  ): Promise<{
    task: Task;
    latestApproval?: Task["latestApproval"];
    evidence: Array<{ id: string; title: string; occurredAt: string }>;
  }>;
  runTask(
    id: string,
    expectedVersion: number,
  ): Promise<{ task: Task; runId: string }>;
  pauseTask(id: string, expectedVersion: number): Promise<{ task: Task }>;
  cancelTask(id: string, reason?: string): Promise<{ task: Task }>;
  getEvents(id: string): Promise<StepEvent[]>;
  getArtifact(
    taskId: string,
    artifactId: string,
  ): Promise<{
    artifactId: string;
    contentType: string;
    url: string;
    expiresAt: string;
  }>;
  getProviderSettings(): Promise<ProviderSettings & { keyConfigured: boolean }>;
  updateProviderSettings(
    settings: ProviderSettings,
  ): Promise<ProviderSettings & { keyConfigured: boolean }>;
  decide(
    taskId: string,
    approvalId: string,
    decision: ApprovalDecision,
    expectedVersion: number,
  ): Promise<{ task: Task; decision: ApprovalDecision }>;
}
const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.message || `API request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
};
export const api: ApiClient = {
  listTasks: () => request("/api/tasks"),
  createTask: (input) =>
    request("/api/tasks", { method: "POST", body: JSON.stringify(input) }),
  getTask: (id) => request(`/api/tasks/${id}`),
  runTask: (id, expectedVersion) =>
    request(`/api/tasks/${id}/run`, {
      method: "POST",
      body: JSON.stringify({ expectedVersion }),
    }),
  pauseTask: (id, expectedVersion) =>
    request(`/api/tasks/${id}/pause`, {
      method: "POST",
      body: JSON.stringify({ expectedVersion }),
    }),
  cancelTask: (id, reason) =>
    request(`/api/tasks/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  getEvents: async (id) => {
    const response = await fetch(`/api/tasks/${id}/events`, {
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error(`API request failed (${response.status})`);
    const text = await response.text();
    return text
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => JSON.parse(line.slice(6)) as StepEvent);
  },
  getArtifact: (taskId, artifactId) =>
    request(`/api/tasks/${taskId}/artifacts/${artifactId}`),
  getProviderSettings: () => request("/api/settings/provider"),
  updateProviderSettings: (settings) =>
    request("/api/settings/provider", {
      method: "PUT",
      body: JSON.stringify(settings),
    }),
  decide: (taskId, approvalId, decision, expectedVersion) =>
    request(`/api/tasks/${taskId}/approvals/${approvalId}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision, expectedVersion }),
    }),
};
