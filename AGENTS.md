# AGENTS.md

## Project source of truth

Before implementing or modifying service-layer code, read:

- `docs/service-layer-architecture.md`
- `docs/codex-service-layer-workflow.md`
- The relevant `src/lib/server/modules/**/**.drizzle.ts`
- Existing helpers in:
  - `src/lib/server/modules/errors/index.ts`
  - `src/lib/server/modules/media/r2.ts`
  - `src/lib/server/modules/media/utils.ts`
  - `src/lib/server/modules/env/index.ts`
  - `src/lib/shared/modules/access-control.ts`

When working on notifications, also inspect the relevant notification modules before inventing senders or types:

- `src/lib/server/modules/notifications/email/index.ts`
- `src/lib/server/modules/notifications/email/client.ts`
- `src/lib/server/modules/notifications/email/types.ts`
- `src/lib/server/modules/notifications/email/senders/*`
- `src/lib/server/modules/notifications/sms/index.ts`
- `src/lib/server/modules/notifications/sms/client.ts`
- `src/lib/server/modules/notifications/sms/types.ts`
- `src/lib/server/modules/notifications/sms/senders/*`

## Current service-layer status

- Implemented service modules: `auth`, `addresses`, `products`, `drops`, `wishlist`, `cart`, `shipping`, `promotions`, `orders`, `reviews`.
- Implemented internal service helpers: `inventory` has `inventory.service.ts` transaction helpers used by cart/order-style workflows; its module index exports schema/types only.
- Implemented foundation helpers: `src/lib/server/modules/service-context.ts`, `src/lib/server/modules/auth/guards.ts`, `src/lib/server/modules/service-utils.ts`.
- Schema-only business modules that still need planned services: none in the current core service rollout.
- Existing route helper: `src/lib/server/modules/errors/route-adapter.ts`.
- Planned notification state helper: `src/lib/server/modules/notifications/outbox` as the durable source of truth for async notification state.
- Planned Cloudflare notification transport: Queue producer/consumer bindings, Cron retry/reconciliation, and Dead Letter Queue operational review.
- Existing semantic notification sender: `sendDropLaunchEmail`.
- Missing semantic notification sender: `sendDropLaunchSms`; do not import or call it until it exists.

## Non-negotiable architecture rules

- Routes must not import `db`, Drizzle tables, Drizzle query helpers, or R2 primitives directly.
- Exception: `src/routes/media/[...key]/+server.ts` may import media R2 helpers because it is the media delivery endpoint, not a business route.
- `+page.server.ts` files may call service functions and form schemas only.
- Business writes must go through `*.service.ts`.
- Multi-table writes must use transactions.
- R2 uploads must use compensation cleanup.
- Use the existing `AppError`, `ErrorCode`, and domain error classes.
- Do not create a second error framework.
- Use `$lib/shared/modules/access-control` for Better Auth role/access-control definitions.
- Add server-only authorization helpers where services need permission checks.
- Do not import from `$lib/client/*` inside new server modules, services, cron jobs, or notification modules.
- Server modules that need app URL/app name/config must use `src/lib/server/modules/env/index.ts` via `getEnv()`.
- Do not expose generic CRUD for audit/internal tables such as:
  - inventory movements
  - promo usage
  - order status history
  - notification outbox
  - product-tag junction writes
  - drop-product junction writes

## Notification module rules

- Email and SMS modules are infrastructure helpers, not domain-state owners.
- Database `notification_outbox` is the planned durable source of truth for async notification state.
- The outbox module is the approved narrow exception to the normal rule against adding notification database tables.
- Domain services should enqueue notification intent in the outbox inside the same DB transaction as the business state change, or expose idempotent list/mark helpers for legacy workflows.
- Cloudflare Queues are a fast asynchronous wakeup only; queue messages must contain only `outboxId` or `idempotencyKey`, never full payloads or customer PII.
- Cloudflare Cron should scan/retry pending, due failed, and stale locked outbox rows so missed Queue publishes are recovered.
- Cloudflare Dead Letter Queues are for operational review only; the DB outbox remains durable audit/retry state.
- Queue/Cron/job/orchestration code should send email/SMS and only mark records sent after successful send.
- Do not put actual email/SMS sending inside domain services such as `drops.service.ts` unless explicitly approved.
- Prefer semantic senders over inline message construction:
  - `sendOrderConfirmationEmail`
  - `sendShippingUpdateEmail`
  - `sendDropLaunchEmail`
  - `sendDropLaunchSms` only after it has been implemented and exported
  - `sendOtpSms`
- Normal delivery failures must return typed result objects rather than throwing:
  - `EmailResult`
  - `SmsResult`
- Auth-specific OTP helpers may throw only if the existing auth flow expects thrown failures.
- Batch notification workflows must be idempotent, limit-aware, and safe to retry.
- Failed email/SMS sends must not mark waitlist entries or notification records as sent.
- Cloudflare KV must not be used as the notification outbox; it is only acceptable for short-lived soft state such as OTP cooldowns.
- Notification modules must not import from `$lib/client/*`.
- Notification modules should use `$lib/server/modules/env` for app URL/app name and provider secrets.

## Required workflow

1. Inspect relevant files first.
2. Produce a plan before editing.
3. For new services, first produce a service API plan that maps storefront, admin dashboard, Queue/Cron/job, notification, and related-system needs.
4. Edit the smallest safe set of files.
5. Run typecheck/lint/tests where available.
6. Summarize:
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
- If notification behavior conflicts with `docs/service-layer-architecture.md`, stop and explain the conflict before editing.
