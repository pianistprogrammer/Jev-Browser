# JEV Browser

JEV Browser uses Jev to select typed browser actions, Playwright to open and read real pages, and local Ollama Gemma to write a friendly response from the captured findings. The browser remains visible while the request runs.

## Start locally

Requirements: Node 20.12+ and npm, Ollama, and a valid OpenRouter key. Docker is not required.

```sh
npm install
npx playwright install chromium
ollama pull gemma4:e2b
npm run dev
```

Open `http://localhost:3000`. The API health endpoint is `http://localhost:4000/api/health`.

Before starting, copy `.env.example` to `.env` and set `OPENROUTER_API_KEY`. The API loads the root `.env` even when started through an npm workspace script. The defaults are `JEV_PROVIDER_MODE=openrouter`, `JEV_MODEL=typesafe/jev-1.13`, `OLLAMA_BASE_URL=http://127.0.0.1:11434`, and `OLLAMA_MODEL=gemma4:e2b`. Ollama must be running. Restart the API after changing the environment. Keys stay on the server.

Try: “Open Hacker News and show me the latest news.” Jev can select the newest-submissions page (`/newest`) independently of the ranked front page. The app displays progress, captures rendered headlines and links, and only reports completion after Jev verifies the evidence and Gemma returns the answer. Provider errors, missing evidence, cancellation, and step limits never turn into successful completion.

The application supplies bounded URL/link candidates; Jev selects candidate IDs using OpenRouter's [typed Decisions API](https://github.com/OpenRouterTeam/typescript-sdk/blob/main/docs/sdks/decisions/README.mdx). It cannot invent tool arguments. Gemma receives evidence through [Ollama chat](https://docs.ollama.com/api/chat), with no tool definitions. Supported browser operations are navigation to public HTTPS pages and reading page text/links. Typing, login, posting, purchases, and manual interaction with the preview are not implemented. Unsupported requests fail explicitly. Demo mode does not simulate successful real work.

Only one task controls the browser at a time. Stop cancels subsequent decisions and responses; an in-flight page navigation may finish before the browser becomes available again. The page image is refreshed periodically, and the activity log contains the actual decisions and actions.

Optional infrastructure emulators:

```sh
docker compose -f infra/docker-compose.yml up -d
```

## Checks

```sh
npm run typecheck
npm test
npm run build
```

The API uses an in-memory adapter for local startup. No database is required; task state is reset when the API process restarts. Redis and Azurite remain optional infrastructure for future coordination and artifact storage.
