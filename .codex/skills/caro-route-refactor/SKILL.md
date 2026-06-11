---
name: caro-route-refactor
description: Use when refactoring SvelteKit routes to call service-layer functions and Superforms schemas instead of database, Drizzle, or R2 primitives.
---

# Caro route refactor workflow

## Required reading

- `docs/service-layer-architecture.md`
- `docs/codex-service-layer-workflow.md`
- Target route file
- Relevant module service file
- Relevant module form schema file
- `src/lib/server/infrastructure/errors/route-adapter.ts`

## Route rules

- Do not import `db` in routes.
- Do not import Drizzle tables in routes.
- Do not import Drizzle query helpers in routes.
- Do not import R2 primitives in business routes.
- `src/routes/media/[...key]/+server.ts` is the media R2 exception.
- Use service functions for business reads/writes.
- Use module form schemas for Superforms.
- Use existing route error helpers for AppError handling.
- Do not call notification senders directly from routes unless explicitly approved.
- Keep UI components untouched unless necessary.

## Current service availability

- Services exist for `auth`, `addresses`, `products`, `drops`, `wishlist`, `bag`, `shipping`, `promotions`, `inventory`, `orders`, and `reviews`.
- Inventory exposes curated admin stock APIs through its module index; internal inventory `*Tx` helpers remain direct-import server internals for bag/order transaction workflows.
- Known route debt must be verified from current code before planning a refactor.

## Notification route boundary

Routes should not become notification orchestrators.

- Call the relevant domain service.
- Let the service write domain state and enqueue outbox intent when approved.
- Let Queue/Cron/webhook orchestration send notifications.
- Never put full notification payloads or PII into Queue messages.

## Use MCP

Use Svelte MCP or Context7 MCP before changing uncertain SvelteKit, Svelte 5, or Superforms APIs.

## Before coding, output

1. Files inspected
2. Existing route responsibilities
3. Direct DB/Drizzle/R2 imports to remove
4. Service calls and form schemas to use
5. Missing blockers
6. Notification boundary notes
7. Validation commands
