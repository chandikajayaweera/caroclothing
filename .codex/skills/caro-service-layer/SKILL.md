---
name: caro-service-layer
description: Use when implementing or modifying CaroClothing service-layer modules, *.service.ts files, service DTOs, module form schemas, transactions, R2 media handling, AppError usage, or access-control checks.
---

# Caro service-layer workflow

## Required reading

Before editing, read:

- `docs/service-layer-architecture.md`
- Relevant `*.drizzle.ts`
- `src/lib/server/modules/errors/index.ts`
- `src/lib/server/modules/media/r2.ts`
- `src/lib/server/modules/media/utils.ts`
- `src/lib/shared/modules/access-control.ts`

## Architecture rules

- Service layer owns business logic.
- Routes do not import db/tables/query helpers/R2 primitives.
- Use existing `AppError`, `ErrorCode`, and domain error classes.
- Use transactions for multi-table writes.
- Use R2 compensation cleanup.
- Use object-parameter APIs.
- Keep DTO mapping inside services.
- Do not expose generic CRUD for audit/internal tables.
- Do not import from `$lib/client/*` inside server services.

## Before coding, output

1. Files inspected
2. Business invariants found
3. Exact service APIs to implement
4. Files to edit
5. Transaction strategy
6. R2/media strategy
7. Error strategy
8. Access-control strategy
9. Validation commands
10. Risks/questions

## After coding, output

1. Changed files
2. Validation commands run
3. Validation result
4. Architecture self-review
5. Remaining risks
