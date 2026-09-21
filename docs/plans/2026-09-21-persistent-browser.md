# Persistent Browser Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Run JEV Browser against a persistent, visible Chromium instance while Jev continues to select bounded actions.

**Architecture:** Docker Compose runs LinuxServer Chromium with a persisted profile and CDP proxy. The API connects through CDP in normal runtime and launches an isolated browser only in tests. The browser UI is reverse proxied through the API and embedded in the web app.

**Tech Stack:** Docker Compose, LinuxServer Chromium, CDP, Playwright, Fastify, Next.js.

---

### Task 1: Define the persistent browser service

**Files:**
- Modify: `infra/docker-compose.yml`
- Create: `infra/cdp-proxy.py`
- Modify: `.env.example`

Add persistent Chromium, CDP, and UI variables. Mount the browser profile and CDP relay script.

### Task 2: Attach the browser session via CDP

**Files:**
- Modify: `apps/api/src/config.ts`
- Modify: `apps/api/src/browser/session.ts`
- Test: `apps/api/test/workflow.test.ts`

Add a CDP endpoint to config. Connect to its `/json/version` websocket in normal runtime; preserve direct launch for test fixtures.

### Task 3: Embed Chromium UI

**Files:**
- Create: `apps/api/src/browser/proxy.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/web/src/app/page.tsx`

Proxy browser UI and websocket traffic through `/browser-ui`; render it in the workspace when available.

### Task 4: Verify

Run `npm run typecheck`, `npm test`, and `docker compose -f infra/docker-compose.yml config`.
