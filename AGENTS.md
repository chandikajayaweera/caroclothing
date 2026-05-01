# AGENTS.md

## Project source of truth

Before implementing or modifying service-layer code, read:

- `docs/service-layer-architecture.md`
- The relevant `src/lib/server/modules/**/**.drizzle.ts`
- Existing helpers in:
  - `src/lib/server/modules/errors/index.ts`
  - `src/lib/server/modules/media/r2.ts`
  - `src/lib/server/modules/media/utils.ts`
  - `src/lib/shared/modules/access-control.ts`

## Non-negotiable architecture rules

- Routes must not import `db`, Drizzle tables, Drizzle query helpers, or R2 primitives directly.
- `+page.server.ts` files may call service functions and form schemas only.
- Business writes must go through `*.service.ts`.
- Multi-table writes must use transactions.
- R2 uploads must use compensation cleanup.
- Use the existing `AppError`, `ErrorCode`, and domain error classes.
- Do not create a second error framework.
- Use `$lib/shared/modules/access-control` for Better Auth role/access-control definitions.
- Add server-only authorization helpers where services need permission checks.
- Do not import from `$lib/client/*` inside new server services.
- Do not expose generic CRUD for audit/internal tables such as:
  - inventory movements
  - promo usage
  - order status history
  - product-tag junction writes
  - drop-product junction writes

## Required workflow

1. Inspect relevant files first.
2. Produce a plan before editing.
3. Edit the smallest safe set of files.
4. Run typecheck/lint/tests where available.
5. Summarize:
   - changed files
   - validation commands
   - failures
   - risks
   - follow-up work

## Anti-hallucination rules

- Never assume a helper exists. Search before using it.
- Never invent import paths.
- Never change schema behavior unless explicitly asked.
- If a dependency API is uncertain, use Context7 MCP or Svelte MCP before coding.
- If tests fail, fix the cause. Do not weaken tests or remove checks.
- If the implementation conflicts with schema comments, stop and explain the conflict.