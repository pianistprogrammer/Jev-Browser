import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";
describe("API contracts", () => {
  it("starts without invented tasks or completion events", async () => {
    const { app } = buildServer();
    const response = await app.inject({ method: "GET", url: "/api/tasks" });
    expect(response.statusCode).toBe(200);
    expect(response.json().items).toEqual([]);
    await app.close();
  });
  it("rejects unsafe task URLs", async () => {
    const { app } = buildServer();
    const response = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: { goal: "Read local", startUrl: "http://127.0.0.1:3000" },
    });
    expect(response.statusCode).toBe(422);
    await app.close();
  });
});
