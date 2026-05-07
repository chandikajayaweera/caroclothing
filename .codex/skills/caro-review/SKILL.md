---
name: caro-review
description: Use when reviewing a diff for CaroClothing architecture compliance, service-layer correctness, notification boundaries, hallucinated imports, missing transactions, and unsafe route logic.
---

# Caro architecture review checklist

Review only unless explicitly asked to edit.

Check:

- No direct `db` imports in `src/routes/**`.
- No Drizzle table imports in `src/routes/**`.
- No Drizzle query helper imports in `src/routes/**`.
- No R2 primitive imports in routes.
- Allow `src/routes/media/[...key]/+server.ts` as the media delivery endpoint R2 exception.
- No `$lib/client/*` imports inside `src/lib/server/**`.
- Server modules use `$lib/server/modules/env` for server-side app config and provider secrets.
- Service functions enforce access control for privileged operations.
- Expected business errors use existing `AppError`, `ErrorCode`, and domain error classes.
- Multi-table writes use transactions.
- Inventory writes create movement rows.
- Cart writes respect exclusive owner and upsert behavior.
- Promo usage updates are atomic.
- R2 upload/update/delete flows have compensation cleanup.
- Form schemas are separate from DB schemas when files or UI-only fields exist.
- Internal junction/audit tables are not exposed as generic CRUD resources.
- Docs match current code, especially implemented services, planned helpers, and exported notification senders.
- New services were planned from storefront, admin dashboard, checkout/account, cron/job, support, and notification needs.

Notification checks:

- Domain services do not send email/SMS directly unless explicitly approved.
- Domain services expose idempotent list/mark helpers for notification workflows.
- Cron/job/orchestration code sends notifications and marks records notified only after successful send.
- `sendEmail`/email senders preserve `EmailResult` for normal delivery failures.
- `sendSms`/SMS senders preserve `SmsResult` for normal delivery failures.
- Semantic senders are used instead of inline message construction where available.
- `sendDropLaunchSms` is not called unless it has been implemented and exported.
- Failed notification sends do not mark entries as notified.
- Batch notification workflows are limit-aware and safe to retry.

Validation checks:

- Validation commands were run.
- No tests were weakened or removed to pass validation.

Output:

1. Pass/fail summary
2. Violations
3. Risk level
4. Required fixes
5. Docs drift
6. Optional improvements
