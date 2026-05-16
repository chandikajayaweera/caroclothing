---
name: caro-review
description: Use when reviewing a diff for CaroClothing architecture compliance, service-layer correctness, notification boundaries, hallucinated imports, missing transactions, and unsafe route logic.
---

# Caro architecture review checklist

Review only unless explicitly asked to edit.

## Core checks

- No direct `db` imports in `src/routes/**`.
- No Drizzle table imports in `src/routes/**`.
- No Drizzle query helper imports in `src/routes/**`.
- No R2 primitive imports in business routes.
- `src/routes/media/[...key]/+server.ts` is the allowed media R2 exception.
- No `$lib/client/*` imports inside `src/lib/server/**`.
- Server modules use `$lib/server/infrastructure/env` for server-side app config and provider secrets.
- Service functions enforce access control for privileged operations.
- Expected business errors use existing `AppError`, `ErrorCode`, and domain error classes.
- Multi-table writes use transactions.
- Inventory writes create movement rows.
- Cart writes respect exclusive owner and upsert behavior.
- Promo usage updates are atomic.
- R2 upload/update/delete flows have compensation cleanup.
- Form schemas are separate from DB schemas when files or UI-only fields exist.
- Internal junction/audit tables are not exposed as generic CRUD resources.
- Docs, skills, and agents match current code paths and implemented service/notification status.
- New services were planned from storefront, admin dashboard, checkout/account, Queue/Cron/job, support, notification, and related-module needs.

## Notification checks

- Domain services do not send email/SMS directly unless explicitly approved.
- Auth welcome and Google-linked lifecycle emails use outbox rows; OTP SMS is the current synchronous/direct auth exception.
- Domain services enqueue `notification_outbox` intent inside the business transaction.
- DB outbox remains durable source of truth for async notification state.
- Queue messages contain only `outboxId` and/or `idempotencyKey`.
- Queue/Cron/job/orchestration code sends notifications and marks rows sent only after successful typed send results.
- Cron recovers pending, due failed, and stale locked outbox rows.
- DLQ is operational review only, not durable business history.
- Email senders preserve `EmailResult` for normal delivery failures.
- SMS senders preserve `SmsResult` for normal delivery failures.
- Semantic senders are used where available.
- Failed notification sends do not mark entries as sent.
- Batch notification workflows are limit-aware and safe to retry.
- Cloudflare KV is not notification outbox.
- SMS sender purposes are correct for OTP, transactional, and promotional messages.

## Validation checks

- Relevant validation commands were run.
- No tests were weakened or removed to pass validation.
- Stale path searches do not find removed modules-layer infrastructure paths or removed service context/utils filenames.

## Output

1. Pass/fail summary
2. Findings ordered by severity
3. Docs drift
4. Required fixes
5. Residual risks
