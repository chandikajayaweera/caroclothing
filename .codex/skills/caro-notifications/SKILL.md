---
name: caro-notifications
description: Use when adding or modifying CaroClothing email/SMS notification helpers, semantic senders, cron notification orchestration, waitlist notification marking, EmailResult/SmsResult contracts, or notification-related docs.
---

# Caro notification workflow

## Required reading

Before editing, read:

- `docs/service-layer-architecture.md`
- `src/lib/server/modules/env/index.ts`
- `src/lib/server/modules/notifications/email/index.ts`
- `src/lib/server/modules/notifications/email/types.ts`
- `src/lib/server/modules/notifications/email/client.ts`
- `src/lib/server/modules/notifications/email/senders/*`
- `src/lib/server/modules/notifications/sms/index.ts`
- `src/lib/server/modules/notifications/sms/types.ts`
- `src/lib/server/modules/notifications/sms/client.ts`
- `src/lib/server/modules/notifications/sms/senders/*`
- Any service module whose notification state is being listed or marked.
- `src/lib/server/modules/cron/scheduled-jobs.ts` when cron/job orchestration is involved.

## Notification rules

- Notification modules are server infrastructure modules.
- Do not import from `$lib/client/*`.
- Use `getEnv()` from `$lib/server/modules/env` for app URL/app name/provider secrets.
- Keep `sendEmail` and `sendSms` as typed primitives.
- Normal delivery failures return typed results:
  - `EmailResult`
  - `SmsResult`
- Do not make normal delivery failures throw unless the existing auth flow explicitly expects thrown failures.
- Prefer semantic senders such as `sendDropLaunchEmail` and `sendDropLaunchSms`.
- Do not add notification database tables unless explicitly requested.
- Do not redesign the notification system for small sender additions.

## Domain boundary rules

- Domain services should not send email/SMS directly unless explicitly approved.
- Domain services expose idempotent list/mark helpers.
- Cron/job/orchestration code sends email/SMS and marks records notified only after successful sends.
- Failed sends must not mark records as notified.
- Batch jobs must be idempotent, limit-aware, and safe to retry.

## Before coding, output

1. Files inspected
2. Existing sender/result contracts
3. Existing exports
4. Proposed sender/type changes
5. Domain/cron integration boundary
6. Validation commands
7. Risks/questions

## After coding, output

1. Changed files
2. Validation commands run
3. Validation result
4. Notification boundary self-review
5. Remaining risks
