---
name: caro-service-layer
description: Use when implementing or modifying CaroClothing service-layer modules, *.service.ts files, service DTOs, module form schemas, transactions, R2 media handling, AppError usage, access-control checks, or service-owned notification state helpers.
---

# Caro service-layer workflow

## Required reading

Before editing, read:

- `docs/service-layer-architecture.md`
- Relevant `*.drizzle.ts`
- `src/lib/server/modules/errors/index.ts`
- `src/lib/server/modules/media/r2.ts`
- `src/lib/server/modules/media/utils.ts`
- `src/lib/server/modules/env/index.ts`
- `src/lib/shared/modules/access-control.ts`

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
- Use existing `AppError`, `ErrorCode`, and domain error classes.
- Use transactions for multi-table writes.
- Use R2 compensation cleanup.
- Use object-parameter APIs.
- Keep DTO mapping inside services.
- Do not expose generic CRUD for audit/internal tables.
- Do not import from `$lib/client/*` inside server services, server notification modules, or cron jobs.
- Use `getEnv()` from `$lib/server/modules/env` for server-side app config and provider secrets.

## Notification boundary rules

- Domain services expose idempotent list/mark helpers for notification workflows.
- Cron/job/orchestration code sends email/SMS and marks records notified only after successful send.
- Do not put actual email/SMS sending inside domain services such as `drops.service.ts` unless explicitly approved.
- Use semantic senders where available, such as `sendDropLaunchEmail` and `sendDropLaunchSms`.
- Preserve typed result contracts: `EmailResult` and `SmsResult`.
- Normal delivery failures should return typed failure results, not throw.
- Batch notification workflows must be idempotent, limit-aware, and safe to retry.

## Before coding, output

1. Files inspected
2. Business invariants found
3. Exact service APIs to implement
4. Files to edit
5. Transaction strategy
6. R2/media strategy
7. Notification strategy, if any
8. Error strategy
9. Access-control strategy
10. Validation commands
11. Risks/questions

## After coding, output

1. Changed files
2. Validation commands run
3. Validation result
4. Architecture self-review
5. Remaining risks
