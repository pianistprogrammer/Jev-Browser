export { buildServer } from "./server.js";
/*

const app = Fastify({ logger: false });

const providerSchema = z.enum(["demo", "openrouter"]);
const taskSchema = z.object({
  goal: z.string().min(1),
  startUrl: z.string().url(),
  providerMode: providerSchema.optional(),
});

const tasks = [
  {
    id: "task-101",
    userId: "user-1",
    goal: "Compare Seattle coworking plans",
    startUrl: "https://demo.jev.local/plans",
    providerMode: "demo" as ProviderMode,
    state: "awaiting_approval" as TaskState,
    version: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "task-102",
    userId: "user-1",
    goal: "Collect refund policy language",
    startUrl: "https://demo.jev.local/support/refund",
    providerMode: "demo" as ProviderMode,
    state: "completed" as TaskState,
    version: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

void app.register(cors, {
  origin: true,
});

app.get("/api/health", async () => ({
  status: "ok",
  services: { database: "memory" },
  providerMode: "demo",
}));

app.get("/api/tasks", async () => ({
  items: tasks,
  nextCursor: undefined,
}));

app.post("/api/tasks", async (request, reply) => {
  const parsed = taskSchema.safeParse(request.body);
  if (!parsed.success) {
    reply.code(400);
    return {
      error: { code: "INVALID_REQUEST", message: "Task payload is invalid." },
    };
  }

  const task = {
    id: `task-${Date.now()}`,
    userId: "user-1",
    goal: parsed.data.goal,
    startUrl: parsed.data.startUrl,
    providerMode: parsed.data.providerMode ?? "demo",
    state: "draft" as TaskState,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  tasks.unshift(task);
  return {
    task,
    session: {
      taskId: task.id,
      status: "active",
      startedAt: new Date().toISOString(),
    },
  };
});

app.get("/api/tasks/:taskId", async (request) => {
  const task = tasks.find(
    (item) => item.id === (request.params as { taskId: string }).taskId,
  );
  if (!task) {
    throw new Error("Task not found");
  }
  return {
    task,
    latestApproval: null,
    evidence: [
      {
        id: "evidence-1",
        kind: "screenshot",
        title: "Browser snapshot",
        createdAt: new Date().toISOString(),
      },
    ],
  };
});

app.post("/api/tasks/:taskId/run", async (request) => {
  const { taskId } = request.params as { taskId: string };
  const task = tasks.find((item) => item.id === taskId);
  if (!task) {
    throw new Error("Task not found");
  }
  task.state = "running";
  task.version += 1;
  return { task, runId: `run-${Date.now()}` };
});

app.post("/api/tasks/:taskId/pause", async (request) => {
  const { taskId } = request.params as { taskId: string };
  const task = tasks.find((item) => item.id === taskId);
  if (!task) {
    throw new Error("Task not found");
  }
  task.state = "paused";
  task.version += 1;
  return { task };
});

app.get("/api/tasks/:taskId/events", async () => ({
  stream: true,
  events: [
    {
      id: "evt-1",
      type: "task.updated",
      payload: { state: "running" },
      occurredAt: new Date().toISOString(),
    },
  ],
}));

app.get("/api/settings/provider", async () => ({
  mode: "demo",
  model: "jev/typesafe-browser",
  keyConfigured: false,
}));

app.put("/api/settings/provider", async (request) => {
  const body = z
    .object({ mode: providerSchema, model: z.string().min(1) })
    .safeParse(request.body);
  if (!body.success) {
    throw new Error("Invalid provider settings");
  }
  return { ...body.data, keyConfigured: false };
});

app
  .listen({ port: 4000, host: "0.0.0.0" })
  .then(() => {
    console.log("API listening on http://localhost:4000");
  })
  .catch((error) => {
    console.error("Failed to start API", error);
    process.exit(1);
  });
*/
