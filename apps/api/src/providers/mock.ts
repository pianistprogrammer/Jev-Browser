import type { JevProvider } from "./types.js";
export class MockJevProvider implements JevProvider {
  async decide(): Promise<never> {
    throw new Error("Demo mode cannot execute your request. Set JEV_PROVIDER_MODE=openrouter and configure a valid OpenRouter key in .env.");
  }
}
