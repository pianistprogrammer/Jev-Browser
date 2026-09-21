# JEV Browser

JEV Browser uses Jev to select typed, bounded browser actions, Playwright to operate and read real pages, and a configurable local Ollama model to write a friendly response from captured findings. The browser remains visible while the request runs.

## Start locally

Requirements: Node 20.12+ and npm, Ollama, a valid OpenRouter key, and the running Jarvis Chromium container (`jarvis-browser`) on CDP port 9223.

```sh
npm install
npx playwright install chromium
ollama pull gemma4:e2b
npm run dev
```

Open `http://localhost:3000`. The API health endpoint is `http://localhost:4000/api/health`.
Before starting, copy `.env.example` to `.env` and set `OPENROUTER_API_KEY`. The API attaches to Jarvis Chromium at `BROWSER_CDP_URL=http://127.0.0.1:9223` and proxies its UI from `BROWSER_UI_URL=http://127.0.0.1:3010`. The defaults are `JEV_PROVIDER_MODE=openrouter`, `JEV_MODEL=typesafe/jev-1.13`, `OLLAMA_BASE_URL=http://127.0.0.1:11434`, and `OLLAMA_MODEL=gemma4:e2b`; set `OLLAMA_MODEL` to your installed Qwen model when desired. Restart the API after changing the environment. Keys stay on the server.

Try: “Open Hacker News and show me the latest news.” Jev can select the newest-submissions page (`/newest`) independently of the ranked front page. The app displays progress, embeds the live Chromium UI, captures rendered headlines and links, and only reports completion after Jev verifies the evidence and the configured response model returns the answer. Provider errors, missing evidence, cancellation, and step limits never turn into successful completion.

The application supplies bounded URL, element, and tab candidates; Jev selects candidate IDs using OpenRouter's [typed Decisions API](https://github.com/OpenRouterTeam/typescript-sdk/blob/main/docs/sdks/decisions/README.mdx). It cannot invent tool arguments. The configured Ollama model receives evidence through chat, with no tool definitions. Supported browser operations are navigation to public HTTPS pages, snapshots, visible-element clicks, filling an observed input with the user's request, key presses, scrolling, tab switching, and reading page text/links. Login, posting, purchases, and manual interaction with the preview are not implemented. Unsupported requests fail explicitly. Demo mode does not simulate successful real work.

Only one task controls the shared browser at a time. Stop cancels subsequent decisions and responses; an in-flight page navigation may finish before the browser becomes available again. The activity log contains the actual decisions and actions.
## Checks

```sh
npm run typecheck
npm test
npm run build
```
The API uses an in-memory store for local startup. No database or external infrastructure is required; task state resets when the API process restarts.
