---
name: caro-service-layer
description: Use when implementing or modifying CaroClothing service-layer modules, *.service.ts files, service DTOs, module form schemas, transactions, R2 media handling, AppError usage, access-control checks, or service-owned notification state helpers.
---

# Caro service-layer workflow

## Required reading

Before editing, read:

- `docs/service-layer-architecture.md`
- `docs/codex-service-layer-workflow.md`
- Relevant `*.drizzle.ts`
- `src/lib/server/modules/errors/index.ts`
- `src/lib/server/modules/media/r2.ts`
- `src/lib/server/modules/media/utils.ts`
- `src/lib/server/modules/env/index.ts`
- `src/lib/shared/modules/access-control.ts`

## Current codebase state

- Implemented services: `auth`, `addresses`, `products`, `drops`, `wishlist`.
- Schema-only service candidates: `cart`, `inventory`, `orders`, `promotions`, `reviews`, `shipping`.
- Implemented foundations: `service-context.ts`, `auth/guards.ts`.
- Planned but missing foundations: `service-utils.ts`.
- Existing drop notification sender: `sendDropLaunchEmail`.
- Missing drop SMS sender: `sendDropLaunchSms`.

If docs mention an API/helper not present in code, report the mismatch before importing or using it.

If the task touches email/SMS notification state, waitlists, cron notification jobs, or notification senders, also read:

- `src/lib/server/modules/notifications/email/index.ts`
- `src/lib/server/modules/notifications/email/types.ts`
- `src/lib/server/modules/notifications/email/client.ts`
- `src/lib/server/modules/notifications/email/senders/*`
- `src/lib/server/modules/notifications/sms/index.ts`
- `src/lib/server/modules/notifications/sms/types.ts`
- `src/lib/server/modules/notifications/sms/client.ts`
- `src/lib/server/modules/notifications/sms/senders/*`

## Architecture rules

- Service layer owns business logic.
- Routes do not import db/tables/query helpers/R2 primitives.
- Exception: `src/routes/media/[...key]/+server.ts` may import media R2 helpers because it serves media objects.
- Use existing `AppError`, `ErrorCode`, and domain error classes.
- Use transactions for multi-table writes.
- Use R2 compensation cleanup.
- Use object-parameter APIs.
- Keep DTO mapping inside services.
- Do not expose generic CRUD for audit/internal tables.
- Curate service APIs from storefront, admin dashboard, checkout/account, cron/job, support, and notification needs before coding.
- Do not import from `$lib/client/*` inside server services, server notification modules, or cron jobs.
- Use `getEnv()` from `$lib/server/modules/env` for server-side app config and provider secrets.

## Notification boundary rules

- Domain services expose idempotent list/mark helpers for notification workflows.
- Cron/job/orchestration code sends email/SMS and marks records notified only after successful send.
- Do not put actual email/SMS sending inside domain services such as `drops.service.ts` unless explicitly approved.
- Use semantic senders where available, such as `sendDropLaunchEmail`.
- Do not call `sendDropLaunchSms` until it is implemented and exported.
- Preserve typed result contracts: `EmailResult` and `SmsResult`.
- Normal delivery failures should return typed failure results, not throw.
- Batch notification workflows must be idempotent, limit-aware, and safe to retry.

## Before coding, output

1. Files inspected
2. Business invariants found
3. Storefront/admin/checkout/cron/support API requirements
4. Exact service APIs to implement and APIs not to expose
5. Files to edit
6. Transaction strategy
7. R2/media strategy
8. Notification strategy, if any
9. Error strategy
10. Access-control strategy
11. Validation commands
12. Docs-vs-code mismatches
13. Risks/questions

## After coding, output

1. Changed files
2. Validation commands run
3. Validation result
4. Architecture self-review
5. Remaining risks
