import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

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
  qwenBaseUrl: string;
  qwenModel: string;
  browserHeadless: boolean;
  browserCdpUrl: string;
  browserUiUrl: string;
  browserUser: string;
  browserPassword: string;
  browserHomeUrl: string;
};

export const loadConfig = (): Config => ({
  port: Number(process.env.API_PORT ?? 4000),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
  qwenBaseUrl: process.env.LLAMA_BASE_URL ?? "http://127.0.0.1:8180/v1",
  qwenModel: process.env.LLAMA_MODEL ?? "qwen-local",
  browserHeadless: process.env.BROWSER_HEADLESS !== "false",
  browserCdpUrl: process.env.BROWSER_CDP_URL ?? "http://127.0.0.1:9223",
  browserUiUrl: process.env.BROWSER_UI_URL ?? "http://127.0.0.1:3010",
  browserUser: process.env.BROWSER_USER ?? "agent",
  browserPassword: process.env.BROWSER_PASSWORD ?? "",
  browserHomeUrl: process.env.BROWSER_HOME_URL ?? "about:blank",
});
