import Fastify from "fastify";
import cors from "@fastify/cors";
import { createTaskSchema, versionSchema, taskSummary, type Task } from "@jev/contracts";
import { loadConfig, type Config } from "./config.js";
import { MemoryStore } from "./store.js";
import { validateNavigationUrl } from "./policy/navigation.js";
import { QwenAgent } from "./providers/qwen.js";
import { PlaywrightBrowserSession, type BrowserSessionDriver } from "./browser/session.js";
import { mountBrowserProxy } from "./browser/proxy.js";
import { runBrowserTask } from "./runner.js";

type Dependencies = { config?: Config; browser?: BrowserSessionDriver; agent?: QwenAgent; logger?: boolean };

export const buildServer = (dependencies: Dependencies = {}) => {
  const config = dependencies.config ?? loadConfig();
  const app = Fastify({ logger: dependencies.logger ?? true });
  const store = new MemoryStore();
  const browser = dependencies.browser ?? new PlaywrightBrowserSession(config.browserHeadless, config.browserCdpUrl);
  // Each task gets its own QwenAgent instance so conversation history is isolated
  const makeAgent = () => dependencies.agent ?? new QwenAgent(config.qwenBaseUrl, config.qwenModel);

  let activeRun: { taskId: string; controller: AbortController; promise: Promise<void> } | undefined;
  const errorBody = (code: string, message: string) => ({ error: { code, message } });

  app.register(cors, { origin: config.webOrigin });
  const publicTask = (task: Task) => ({ ...task, observation: undefined, session: { ...task.session, screenshot: "" } });
  mountBrowserProxy(app, config.browserUiUrl, config.browserUser, config.browserPassword);

  app.get("/api/health", async () => ({ status: "ok", model: config.qwenModel, qwenBaseUrl: config.qwenBaseUrl }));
  app.get("/api/tasks", async () => ({ items: [...store.tasks.values()].map(taskSummary).reverse() }));
  app.get("/api/browser/status", async () => ({ ...browser.status(), taskId: activeRun?.taskId }));
  app.get("/api/browser/screenshot", async (_request, reply) => {
    if (!browser.status().active) return reply.code(404).send(errorBody("NOT_FOUND", "Browser is not open."));
    try { return reply.type("image/jpeg").header("cache-control", "no-store").send(await browser.screenshot()); }
    catch { return reply.code(503).send(errorBody("BROWSER_BUSY", "The browser is loading. Try the next frame.")); }
  });

  app.post("/api/tasks", async (request, reply) => {
    const parsed = createTaskSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody("VALIDATION_ERROR", parsed.error.message));
    const startUrl = parsed.data.startUrl ?? config.browserHomeUrl;
    try { if (startUrl !== "about:blank") validateNavigationUrl(startUrl, false); }
    catch (error) { return reply.code(422).send(errorBody("POLICY_BLOCKED", (error as Error).message)); }
    const task = store.create(parsed.data.goal, startUrl);
    store.addEvent(task, "state", "task.created", "Ready to start.", "allowed");
    return reply.code(201).send({ task: publicTask(task), session: task.session });
  });

  app.get<{ Params: { taskId: string } }>("/api/tasks/:taskId", async (request, reply) => {
    const task = store.tasks.get(request.params.taskId);
    if (!task) return reply.code(404).send(errorBody("NOT_FOUND", "Task not found."));
    return { task: publicTask(task), evidence: task.events.filter(e => e.type === "browser").map(e => ({ id: e.id, title: e.summary, occurredAt: e.occurredAt })) };
  });

  app.get<{ Params: { taskId: string } }>("/api/tasks/:taskId/screenshot", async (request, reply) => {
    const task = store.tasks.get(request.params.taskId);
    if (!task?.session.screenshot) return reply.code(404).send(errorBody("NOT_FOUND", "No browser snapshot yet."));
    return reply.type("image/jpeg").header("cache-control", "no-store").send(Buffer.from(task.session.screenshot.split(",")[1], "base64"));
  });

  app.post<{ Params: { taskId: string } }>("/api/tasks/:taskId/run", async (request, reply) => {
    const task = store.tasks.get(request.params.taskId);
    if (!task) return reply.code(404).send(errorBody("NOT_FOUND", "Task not found."));
    const parsed = versionSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody("VALIDATION_ERROR", "Expected a task version."));
    if (parsed.data.expectedVersion !== task.version) return reply.code(409).send(errorBody("CONFLICT", "Task version is stale."));
    if (activeRun) return reply.code(409).send(errorBody("BROWSER_BUSY", "The browser is working on another request."));
    if (!["draft", "paused"].includes(task.state)) return reply.code(409).send(errorBody("INVALID_STATE", "This request has already run."));
    task.state = "running";
    task.error = undefined;
    store.addEvent(task, "state", "task.run", "Working out where to go…", "allowed");
    const controller = new AbortController();
    const response = { task: publicTask(task), runId: crypto.randomUUID() };
    const promise = new Promise<void>(resolve => setImmediate(resolve))
      .then(() => runBrowserTask(task, store, browser, makeAgent(), controller.signal))
      .finally(() => { activeRun = undefined; });
    activeRun = { taskId: task.id, controller, promise };
    return reply.code(202).send(response);
  });

  for (const action of ["pause", "cancel"] as const) {
    app.post<{ Params: { taskId: string } }>(`/api/tasks/:taskId/${action}`, async (request, reply) => {
      const task = store.tasks.get(request.params.taskId);
      if (!task) return reply.code(404).send(errorBody("NOT_FOUND", "Task not found."));
      if (!["draft", "running", "paused"].includes(task.state)) return reply.code(409).send(errorBody("INVALID_STATE", "This task is already finished."));
      if (action === "pause") {
        const parsed = versionSchema.safeParse(request.body);
        if (!parsed.success || parsed.data.expectedVersion !== task.version) return reply.code(409).send(errorBody("CONFLICT", "Task version is stale."));
      }
      if (activeRun?.taskId === task.id) activeRun.controller.abort();
      task.state = action === "pause" ? "paused" : "cancelled";
      store.addEvent(task, "state", `task.${action}`, action === "pause" ? "Paused." : "Stopped.", "allowed");
      return reply.code(202).send({ task: publicTask(task) });
    });
  }

  app.get<{ Params: { taskId: string } }>("/api/tasks/:taskId/events", async (request, reply) => {
    const task = store.tasks.get(request.params.taskId);
    if (!task) return reply.code(404).send(errorBody("NOT_FOUND", "Task not found."));
    return reply.type("text/event-stream").send(task.events.map(e => `id: ${e.id}\ndata: ${JSON.stringify(e)}\n\n`).join(""));
  });

  app.get("/api/settings/provider", async () => ({ provider: "qwen", model: config.qwenModel }));
  app.put("/api/settings/provider", async (_request, reply) => reply.code(409).send(errorBody("RESTART_REQUIRED", "Update provider settings in .env and restart the API.")));
  app.post("/api/tasks/:taskId/approvals/:approvalId/decision", async (_request, reply) => reply.code(409).send(errorBody("UNSUPPORTED_ACTION", "This version only supports read-only browsing.")));
  app.get("/api/tasks/:taskId/artifacts/:artifactId", async (_request, reply) => reply.code(404).send(errorBody("NOT_FOUND", "Artifact not found.")));

  app.addHook("onClose", async () => {
    activeRun?.controller.abort();
    await browser.close();
    await activeRun?.promise;
  });

  return { app, store, browser };
};

if (process.env.NODE_ENV !== "test") {
  const { app } = buildServer();
  app.listen({ port: loadConfig().port, host: "127.0.0.1" }).catch(error => { app.log.error(error); process.exitCode = 1; });
  const shutdown = () => { void app.close().then(() => process.exit(0)); };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
