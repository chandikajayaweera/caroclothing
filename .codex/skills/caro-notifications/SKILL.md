---
name: caro-notifications
description: Use when adding or modifying CaroClothing email/SMS notification helpers, semantic senders, notification outbox state, Cloudflare Queue/Cron/DLQ orchestration, waitlist notification marking, EmailResult/SmsResult contracts, or notification-related docs.
---

# Caro notification workflow

## Required reading

Before editing, read:

- `docs/service-layer-architecture.md`
- `docs/codex-service-layer-workflow.md`
- `src/lib/server/modules/env/index.ts`
- `src/lib/server/modules/notifications/email/index.ts`
- `src/lib/server/modules/notifications/email/types.ts`
- `src/lib/server/modules/notifications/email/client.ts`
- `src/lib/server/modules/notifications/email/senders/*`
- `src/lib/server/modules/notifications/sms/index.ts`
- `src/lib/server/modules/notifications/sms/types.ts`
- `src/lib/server/modules/notifications/sms/client.ts`
- `src/lib/server/modules/notifications/sms/senders/*`
- `src/lib/server/modules/notifications/outbox/*` when present.
- Any service module whose notification state is being listed or marked.
- `src/lib/server/modules/queue` when Queue orchestration is involved.
- `src/lib/server/modules/cron/scheduled-jobs.ts` when cron/job orchestration is involved.
- Cloudflare Queue/Cron/DLQ bindings and handler entrypoints when transport orchestration is involved.

## Notification rules

- Notification modules are server infrastructure modules.
- Do not import from `$lib/client/*`.
- Use `getEnv()` from `$lib/server/modules/env` for app URL/app name/provider secrets.
- Keep `sendEmail` and `sendSms` as typed primitives.
- Normal delivery failures return typed results:
  - `EmailResult`
  - `SmsResult`
- Do not make normal delivery failures throw unless the existing auth flow explicitly expects thrown failures.
- Prefer semantic senders such as `sendDropLaunchEmail`.
- `sendDropLaunchEmail` currently exists and is exported.
- `sendDropLaunchSms` exists and is exported for drop launch SMS workflows.
- The implemented `notification_outbox` module is the approved durable source of truth for async notification state.
- Do not add extra notification database tables beyond the outbox unless explicitly requested.
- Do not redesign the notification system for small sender additions.

## Domain boundary rules

- Domain services should not send email/SMS directly unless explicitly approved.
- Domain services enqueue outbox intent inside the same DB transaction as the business state change.
- Queue messages must contain only `outboxId` or `idempotencyKey`, never full payloads or customer PII.
- Cloudflare Queue consumers and Cron jobs send email/SMS and mark records sent only after successful sends.
- Cloudflare Cron must recover pending, due failed, and stale locked outbox rows.
- Cloudflare DLQ is operational review only; DB outbox remains durable audit/retry state.
- Queue and Cron modules route work; notification outbox remains the owner of notification state.
- Failed sends must not mark records as sent.
- Batch jobs must be idempotent, limit-aware, and safe to retry.
- Cloudflare KV must not be used as the notification outbox.

## Before coding, output

1. Files inspected
2. Existing sender/result contracts
3. Existing exports
4. Missing sender/type/export gaps
5. Proposed sender/type/outbox changes
6. Domain/outbox/Queue/Cron/DLQ integration boundary
7. Validation commands
8. Risks/questions

## After coding, output

1. Changed files
2. Validation commands run
3. Validation result
4. Notification boundary self-review
5. Remaining risks
