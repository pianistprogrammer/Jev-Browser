# JEV Browser Integration Handoff

## Backend

- Folder: `apps/api`
- Run: `npm run dev --workspace @jev/api`
- Port: `4000`
- Build: `npm run build --workspace @jev/api`
- Health: `GET /api/health`
- Current adapter: in-memory demo store; no database is required for this project.

## Frontend

- Folder: `apps/web`
- Dev: `npm run dev --workspace @jev/web`
- Build: `npm run build --workspace @jev/web`
- API seam: `apps/web/src/api/index.ts`
- Mock/demo fallback currently lives in page fixtures and should be replaced at the seam by the live client during integration.

## API routes

- GET `/api/health`
- GET `/api/tasks`
- POST `/api/tasks`
- GET `/api/tasks/:taskId`
- POST `/api/tasks/:taskId/run`
- POST `/api/tasks/:taskId/pause`
- POST `/api/tasks/:taskId/cancel`
- GET `/api/tasks/:taskId/events`
- POST `/api/tasks/:taskId/approvals/:approvalId/decision`
- GET `/api/tasks/:taskId/artifacts/:artifactId`
- GET `/api/settings/provider`
- PUT `/api/settings/provider`

## Database

- Type: None
- Storage: in-memory demo store
- Related optional env: `REDIS_URL`, `STORAGE_CONNECTION_STRING`

## Shared types

- Package: `packages/contracts`
- Import: `@jev/contracts`
- Build: `npm run build --workspace @jev/contracts`

## Services

- Essential: Container Apps
- Optional: Redis, Blob Storage/Azurite
- Enhancement: Key Vault, Application Insights
