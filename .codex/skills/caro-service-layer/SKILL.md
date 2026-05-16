---
name: caro-service-layer
description: Use when implementing or modifying CaroClothing service-layer modules, *.service.ts files, service DTOs, module form schemas, transactions, R2 media handling, AppError usage, access-control checks, or service-owned notification outbox state.
---

# Caro service-layer workflow

## Required reading

Before editing, read:

- `docs/service-layer-architecture.md`
- `docs/codex-service-layer-workflow.md`
- Relevant `*.drizzle.ts`
- Existing service/type/form files for related modules
- Relevant routes and helper modules
- `src/lib/server/foundation/context.ts`
- `src/lib/server/foundation/guards.ts`
- `src/lib/server/foundation/utils.ts`
- `src/lib/server/infrastructure/errors/index.ts`
- `src/lib/server/infrastructure/errors/route-adapter.ts`
- `src/lib/server/infrastructure/media/r2.ts`
- `src/lib/server/infrastructure/media/utils.ts`
- `src/lib/server/infrastructure/env/index.ts`
- `src/lib/shared/modules/access-control.ts`

If the task touches notifications, also read email/SMS modules, `src/lib/server/modules/notifications/outbox/*`, Queue, Cron, and `src/lib/server/infrastructure/notifications/outbox.dispatcher.ts`.

## Current state

- Services exist for `auth`, `addresses`, `products`, `drops`, `wishlist`, `cart`, `shipping`, `promotions`, `inventory`, `orders`, and `reviews`.
- `inventory` exposes curated admin stock APIs through its module index. Internal `*Tx` helpers in `inventory.service.ts` still support cart/order transaction workflows and should be imported directly only by server internals already inside a transaction.
- Foundation helpers exist in `src/lib/server/foundation`.
- Route AppError helpers exist in `src/lib/server/infrastructure/errors/route-adapter.ts`.
- Notification outbox, Queue, Cron recovery, DLQ config, and semantic email/SMS senders are implemented.
- Outbox notification types include `auth_welcome`, `auth_google_linked`, `order_confirmation`, `shipping_update`, `payment_update`, `order_status_update`, and `drop_launch`.

If docs mention a helper not present in code, report the mismatch before importing or using it.

## Rules

- Services own business logic and business writes.
- Routes do not import db, tables, query helpers, or R2 primitives.
- `src/routes/media/[...key]/+server.ts` is the only media R2 route exception.
- Use existing `AppError`, `ErrorCode`, domain errors, and server guards.
- Use transactions for multi-table writes.
- Use R2 compensation cleanup for media changes.
- Use object-shaped service inputs unless an existing module pattern differs.
- Return DTOs when UI needs derived fields or public media URLs.
- Keep DTO mapping inside services.
- Do not expose generic CRUD for audit/internal/junction tables.
- Curate APIs from storefront, admin dashboard, checkout/account, Queue/Cron/job, support, notification, and related-module needs before coding.
- Do not import `$lib/client/*` inside server modules.
- Use `getEnv()` from `$lib/server/infrastructure/env` for server-side app config and provider secrets.
- Use current canonical import paths only.

## Notification boundary

- Domain services enqueue `notification_outbox` intent inside the same DB transaction as the business change.
- Exception: auth welcome and Google-linked lifecycle emails use outbox rows from Better Auth database hooks; OTP SMS remains synchronous/direct where the auth flow expects thrown failures.
- Queue messages carry only `outboxId` and/or `idempotencyKey`.
- Queue/Cron/job orchestration sends email/SMS and marks rows sent only after successful `EmailResult` or `SmsResult`.
- Cron recovers pending, due failed, and stale locked outbox rows.
- DLQ is operational review only; DB outbox remains durable audit/retry state.
- Do not send email/SMS inside domain services unless explicitly approved.
- Prefer semantic senders.
- SMS sender purposes: OTP auth uses `otp`, order/payment/delivery/status uses `transactional`, and drops/offers/campaigns use `promotional`.
- Cloudflare KV is not notification outbox.

## Before coding, output

1. Files inspected
2. Layer classification
3. Business invariants and schema comments
4. Required service APIs and APIs not to expose
5. Files to edit
6. Transaction, R2, notification, error, and access-control strategy
7. Validation commands
8. Docs-vs-code mismatches
9. Risks/questions

## After coding, output

1. Changed files
2. Validation commands and results
3. Architecture self-review
4. Remaining risks
