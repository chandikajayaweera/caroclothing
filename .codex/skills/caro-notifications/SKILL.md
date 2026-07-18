---
name: caro-notifications
description: Use when adding or modifying CaroClothing email/SMS notification helpers, semantic senders, notification outbox state, Cloudflare Queue/Cron/DLQ orchestration, EmailResult/SmsResult contracts, or notification-related docs.
---

# Caro notification workflow

## Required reading

Before editing, read:

- `docs/service-layer-architecture.md`
- `docs/codex-service-layer-workflow.md`
- `src/lib/server/infrastructure/env/index.ts`
- `src/lib/server/infrastructure/email/index.ts`
- `src/lib/server/infrastructure/email/types.ts`
- `src/lib/server/infrastructure/email/client.ts`
- `src/lib/server/infrastructure/email/senders/*`
- `src/lib/server/infrastructure/sms/index.ts`
- `src/lib/server/infrastructure/sms/types.ts`
- `src/lib/server/infrastructure/sms/client.ts`
- `src/lib/server/infrastructure/sms/senders/*`
- `src/lib/server/modules/notifications/outbox/*`
- Any service module whose notification state is listed, enqueued, or marked
- `src/lib/server/orchestration/notifications/*`
- `src/lib/server/orchestration/cron/*`
- `src/lib/server/infrastructure/cloudflare/*`
- Cloudflare Queue/Cron/DLQ bindings and handler entrypoints when transport orchestration is involved

## Current state

- Email/SMS modules are server infrastructure modules.
- `notification_outbox` is implemented and owns durable async notification state.
- Queue producer/consumer bindings, Queue routing, Cron recovery, and DLQ config are implemented.
- Semantic email senders include OTP, welcome, Google-linked, order confirmation, and shipping update.
- Semantic SMS senders include OTP, order confirmation, shipping update, payment update, and order status update.
- Outbox notification types include `auth_welcome`, `auth_google_linked`, `order_confirmation`, `shipping_update`, `payment_update`, and `order_status_update`.
- Runtime SMS config uses `otp`, `transactional`, and `promotional` sender purposes.

## Rules

- Do not import from `$lib/client/*`.
- Use `getEnv()` from `$lib/server/infrastructure/env` for app URL/app name/provider secrets.
- Keep `sendEmail` and `sendSms` as typed primitives.
- Normal delivery failures return `EmailResult` or `SmsResult`.
- Do not make normal delivery failures throw unless the existing auth flow expects thrown failures.
- Prefer semantic senders over inline message construction.
- Do not add notification DB tables beyond outbox unless explicitly requested.
- Do not redesign notification architecture for small sender additions.

## Domain and orchestration boundary

- Domain services should not send email/SMS directly unless explicitly approved.
- Domain services enqueue outbox intent inside the same DB transaction as the business state change.
- Exception: Better Auth welcome and Google-linked lifecycle emails use outbox rows from database hooks; OTP SMS remains synchronous/direct where the auth flow expects thrown failures.
- Queue messages contain only `outboxId` and/or `idempotencyKey`.
- Queue consumers and Cron jobs claim outbox rows, send email/SMS, and mark rows sent only after successful typed send results.
- Cron recovers pending, due failed, and stale locked outbox rows.
- DLQ is operational review only; DB outbox remains durable audit/retry state.
- Queue and Cron modules route work; outbox remains notification state owner.
- Failed sends must not mark notification records as sent.
- Batch jobs must be idempotent, limit-aware, and safe to retry.
- Cloudflare KV must not be used as notification outbox.
- OTP auth SMS uses `otp`; order/payment/delivery/status SMS uses `transactional`; new arrivals/offers/campaigns use `promotional`.

## Before coding, output

1. Files inspected
2. Existing sender/result contracts
3. Existing exports
4. Proposed sender/type/outbox changes
5. Domain/outbox/Queue/Cron/DLQ boundary
6. Validation commands
7. Risks/questions

## After coding, output

1. Changed files
2. Validation commands and results
3. Notification boundary self-review
4. Remaining risks
