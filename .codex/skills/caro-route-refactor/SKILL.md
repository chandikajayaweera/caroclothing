---
name: caro-route-refactor
description: Use when refactoring SvelteKit routes to call service-layer functions and superforms schemas instead of database/R2 primitives.
---

# Caro route refactor workflow

## Required reading

Before editing:

- `docs/service-layer-architecture.md`
- `docs/codex-service-layer-workflow.md`
- The relevant route file
- The relevant module service file
- The relevant module form schema file
- Any relevant route error adapter used by the project

## Route rules

- Do not import `db` in routes.
- Do not import Drizzle tables in routes.
- Do not import Drizzle query helpers in routes.
- Do not import R2 primitives in routes.
- Exception: `src/routes/media/[...key]/+server.ts` may import media R2 helpers because it is the media delivery endpoint.
- Do not call notification senders directly from routes unless explicitly approved.
- Use service functions for business reads/writes.
- Use module form schemas for superforms.
- Use existing route error helpers for AppError handling when present.
- If `src/lib/server/modules/errors/route-adapter.ts` is missing, plan or add it before importing it.
- Keep components untouched unless explicitly requested.

## Current route/service availability

- `auth`, `addresses`, `products`, `drops`, and `wishlist` services exist.
- `cart`, `inventory`, `orders`, `promotions`, `reviews`, and `shipping` services do not exist yet.
- `src/routes/(protected)/account/+page.server.ts` has been refactored to use the auth service.

## Notification route boundary

Routes should not become notification orchestrators. If a route triggers a workflow that later needs email/SMS:

- call the relevant domain service;
- let the service write domain state;
- let cron/job/webhook orchestration send notifications where applicable;
- only use direct notification senders from routes when the architecture doc or task explicitly approves it.

## Use MCP

Use Svelte MCP or Context7 MCP before changing uncertain:

- SvelteKit load/action APIs
- Superforms APIs
- Svelte 5 component APIs

## Before coding, output

1. Files inspected
2. Existing route responsibilities
3. Direct DB/R2 imports to remove
4. Service calls to use
5. Missing service/helper blockers
6. Form schema changes
7. Notification boundary considerations, if any
8. Validation commands
