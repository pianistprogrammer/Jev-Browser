# Project Plan

**Status**: Ready for implementation
**Created**: 2026-09-20
**Last Updated**: 2026-09-20
**Mode**: NEW
**Execution Mode**: guided

---

## 1. Goal

Build JEV Browser as a local-first browser orchestration workspace where a typed model decides what the next action should be, while the application code remains the authority for workflow execution, approval gates, and safety enforcement.

The project is intentionally structured as a controlled browser automation system:

- the model proposes actions and classifications,
- the backend validates each action against policy,
- the UI surfaces state clearly,
- human approval is required before irreversible steps,
- the browser remains isolated and monitored.

This matches the requirement that provider model outputs are narrow and typed, and that the application owns the workflow instead of trusting the model to act directly.

## 2. Product requirements

### Functional requirements

1. Serve a web app and orchestration API from the same repository.
2. Start in deterministic demo mode when no API key is configured.
3. Support an optional OpenRouter-backed provider mode that uses server-side credentials only.
4. Create browser tasks with a goal, start URL, and provider mode.
5. Run task planning, browser navigation, extraction, and approval events in a resumable state machine.
6. Pause before login, payment, purchase, irreversible mutation, and final submission steps.
7. Expose the browser state via a UI timeline, snapshots, and evidence summaries instead of raw browser control.
8. Keep provider secrets out of the browser and out of persisted event payloads.
9. Ensure tasks and artifacts are isolated per account or session context.
10. Support event streaming and replay without duplicating events after reconnect.

### AI decision requirement

The integration model usage is narrow and typed:

```ts
const decision = await openrouter.alpha.decisions.create({
  decisionsRequest: {
    model: "typesafe/jev-1.13",
    state: "Help! My payouts have been failing for 3 days.",
    questions: {
      is_urgent: {
        type: "noul",
        instructions: "Does this message convey urgency?",
        criteria: {
          true: "Explicitly time-sensitive",
          false: "No urgency expressed",
        },
      },
      department: {
        type: "choice",
        instructions: "Which team should handle this?",
        criteria: {
          billing: "Payments, invoicing, refunds",
          technical: "Bugs, outages, integrations",
          sales: "Pricing, upgrades, new accounts",
        },
      },
      frustration: {
        type: "score",
        instructions: "How frustrated is the customer?",
        criteria: ["Calm", "Frustrated", "Very angry"],
      },
    },
  },
});
```

This means the model should answer structured questions and return probability, choice, and score values. The application code then decides how to route or escalate based on those outputs, rather than trusting the model as the final authority.

## 3. Solution architecture

### Frontend

- Framework: Next.js + React
- Stack: TypeScript, App Router, client-side state hydration
- Responsibilities:
  - task workspace UI,
  - route-level task detail and settings screens,
  - provider mode status,
  - approval dialog interactions,
  - event-stream rendering.

### Backend

- Runtime: Node.js + TypeScript
- Web/API framework: Fastify
- Responsibilities:
  - task orchestration,
  - browser session lifecycle,
  - policy checks,
  - Playwright isolation,
  - provider abstraction,
  - audit event logging,
  - approval validation.

### Shared contracts

- Package: `packages/contracts`
- Purpose: shared TypeScript interfaces for tasks, provider responses, approvals, policy events, and agent actions.
- Goal: ensure the frontend, API, and mock provider all speak the same typed language.

## 4. Core workflow

1. A user creates a task with a goal and starting URL.
2. The API selects the configured provider mode:
   - demo for local deterministic behavior,
   - openrouter when an API key is configured.
3. The backend invokes a provider interface that returns typed action suggestions or state classification.
4. The policy engine checks whether the action is safe, allowed, and within bounds.
5. If the action is sensitive, the task enters an approval-required state.
6. The UI displays the assessment and the user decides whether to approve or reject.
7. Only approved actions are executed in Playwright.
8. Task state and audit events are persisted and streamed to the client.

## 5. Safety and policy constraints

The browser automation layer must enforce the following:

- allow only trusted HTTPS navigation by default,
- block private IP ranges, localhost-only demo subdomains unless explicitly allowed, and dangerous schemes,
- reject arbitrary redirects, downloads, form submissions, or credential collection unless explicitly approved,
- treat login, payment, purchase, and final submission as irreversible or sensitive operations,
- redact secrets and tokens from logs and events,
- use one-time approval tokens scoped to a specific task and action,
- maintain a strict separation between model suggestions and execution authority.

## 6. Local development setup

### Required tools

- Node.js 20+
- npm
- Git
- Docker + Docker Compose for optional local emulators

### Local services

- Web app: localhost:3000
- API: localhost:4000
- Optional Redis and Azurite via Docker Compose under `infra/docker-compose.yml`
- Optional OpenRouter configuration via `OPENROUTER_API_KEY` and `JEV_MODEL`

### Default behavior

Without an OpenRouter key, the system should remain functional in demo mode. Demo mode must be clearly visible to the user and should never silently degrade to production behavior.

## 7. Project structure

```text
/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── browser/
│   │   │   ├── config.ts
│   │   │   ├── index.ts
│   │   │   ├── policy/
│   │   │   ├── providers/
│   │   │   ├── server.ts
│   │   │   └── store.ts
│   │   └── test/
│   └── web/
│       ├── src/
│       └── test/
├── packages/
│   └── contracts/
├── infra/
│   └── docker-compose.yml
├── migrations/
├── README.md
├── package.json
├── tsconfig.json
└── .azure/
    ├── requirements.json
    ├── project-plan.md
    └── integration-plan.md
```

## 8. Acceptance criteria

The project is complete when all of the following are true:

- the app runs in demo mode without any OpenRouter key,
- the API health endpoint responds correctly,
- the web UI can create and monitor a task,
- provider mode and model selection are configurable without exposing keys,
- all high-risk actions require approval,
- model suggestion output is structured and typed, not free-form,
- browser automation never runs with unrestricted authority,
- tasks remain resumable and auditable,
- the project has passing type checks and tests,
- provider adapters can be tested in isolation with deterministic fixtures.

## 9. Implementation phases

### Phase 1 — scaffold and contracts

- establish workspace scripts,
- define shared task and provider contracts,
- create health and task routes,
- create a mock provider and demo mode.

### Phase 2 — orchestration and safety

- implement task state machine,
- enforce safety policy and approval gates,
- add event streaming and task versions,
- validate browser and provider boundaries.

### Phase 3 — UI and integration

- build the workspace UI,
- show browser snapshot and timeline,
- connect to API events,
- validate approval UX and disconnected states.

### Phase 4 — production hardening

- add optional Redis and storage connectors,
- add telemetry and audit redaction,
- support a real OpenRouter provider behind a secure server boundary,
- verify full local and demo flows.

## 10. Execution note

The current requirements file is intentionally minimal and does not yet include a detailed business specification. This project plan therefore reflects the app’s actual codebase and the intended architecture: typed model decisions, explicit backend control, and a safe browser automation workflow. The next execution step is to scaffold or continue the implementation against this plan and validate it with the repository’s test and build commands.
