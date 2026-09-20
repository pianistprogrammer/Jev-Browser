import type { ProviderMode } from "@jev/contracts";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

// Resolve from this module; npm workspace scripts start in apps/api.
if (process.env.NODE_ENV !== "test") {
  try {
    const values = parseEnv(readFileSync(new URL("../../../.env", import.meta.url), "utf8"));
    for (const [key, value] of Object.entries(values)) process.env[key] ??= value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
export type Config = {
  port: number;
  webOrigin: string;
  providerMode: ProviderMode;
  model: string;
  openRouterKey?: string;
  openRouterBaseUrl: string;
  browserHeadless: boolean;
  browserHomeUrl: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
};
export const loadConfig = (): Config => {
  const mode =
    process.env.JEV_PROVIDER_MODE === "openrouter" ? "openrouter" : "demo";
  return {
    port: Number(process.env.API_PORT ?? 4000),
    webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
    providerMode: mode,
    model: process.env.JEV_MODEL ?? "typesafe/jev-1.13",
    openRouterKey: process.env.OPENROUTER_API_KEY,
    openRouterBaseUrl:
      process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
    browserHeadless: process.env.BROWSER_HEADLESS !== "false",
    browserHomeUrl:
      process.env.BROWSER_HOME_URL ?? "about:blank",
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
    ollamaModel: process.env.OLLAMA_MODEL ?? "gemma4:e2b",
  };
};
