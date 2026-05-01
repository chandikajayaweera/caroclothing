---
name: caro-route-refactor
description: Use when refactoring SvelteKit routes to call service-layer functions and superforms schemas instead of database/R2 primitives.
---

# Caro route refactor workflow

## Required reading

Before editing:

- `docs/service-layer-architecture.md`
- The relevant route file
- The relevant module service file
- The relevant module form schema file

## Route rules

- Do not import `db` in routes.
- Do not import Drizzle tables in routes.
- Do not import Drizzle query helpers in routes.
- Do not import R2 primitives in routes.
- Use service functions for business reads/writes.
- Use module form schemas for superforms.
- Use existing route error helpers for AppError handling.
- Keep components untouched unless explicitly requested.

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
5. Form schema changes
6. Validation commands
