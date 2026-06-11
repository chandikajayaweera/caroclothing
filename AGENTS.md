# AGENTS.md

## Project Source Of Truth

Before service-layer, route, notification, or Codex-guidance changes, read:

- `docs/service-layer-architecture.md`
- `docs/codex-service-layer-workflow.md`
- Relevant `src/lib/server/modules/**/**.drizzle.ts`
- Relevant service/type/form files and routes
- Existing helpers:
  - `src/lib/server/foundation/context.ts`
  - `src/lib/server/foundation/guards.ts`
  - `src/lib/server/foundation/utils.ts`
  - `src/lib/server/infrastructure/errors/index.ts`
  - `src/lib/server/infrastructure/errors/route-adapter.ts`
  - `src/lib/server/infrastructure/media/r2.ts`
  - `src/lib/server/infrastructure/media/utils.ts`
  - `src/lib/server/infrastructure/env/index.ts`
  - `src/lib/shared/modules/access-control.ts`

For notification work, also inspect:

- `src/lib/server/infrastructure/email/index.ts`
- `src/lib/server/infrastructure/email/client.ts`
- `src/lib/server/infrastructure/email/types.ts`
- `src/lib/server/infrastructure/email/senders/*`
- `src/lib/server/infrastructure/sms/index.ts`
- `src/lib/server/infrastructure/sms/client.ts`
- `src/lib/server/infrastructure/sms/types.ts`
- `src/lib/server/infrastructure/sms/senders/*`
- `src/lib/server/modules/notifications/outbox/*`
- `src/lib/server/infrastructure/notifications/outbox.dispatcher.ts`
- `src/lib/server/infrastructure/queue`
- `src/lib/server/infrastructure/cron/scheduled-jobs.ts`

## Current Service Status

- Implemented service modules: `auth`, `addresses`, `products`, `drops`, `wishlist`, `bag`, `shipping`, `promotions`, `inventory`, `orders`, `reviews`.
- Inventory exposes public admin stock APIs through its module index; internal `*Tx` helpers in `inventory.service.ts` still support bag/order transaction workflows and should be imported directly only by server internals already inside a transaction.
- Bag mutations do not reserve stock. Starting checkout reserves available stock for 10 minutes.
- Leaving checkout without placing an order cancels checkout and releases its reservation.
- Any bag mutation cancels an active checkout and releases its reservation. Expiry releases reservations without clearing bag items.
- Successful order placement transfers the checkout reservation to order-item reservation references, then deletes the bag.
- Implemented foundations: `context.ts`, `guards.ts`, `utils.ts`, and `errors/route-adapter.ts`.
- Schema-only business modules needing service plans: none in current core service rollout.
- Implemented notification state: `src/lib/server/modules/notifications/outbox` owns `notification_outbox` schema, types, idempotency, retry/audit state, and claim/mark/cancel APIs.
- Implemented notification orchestration: `src/lib/server/infrastructure/notifications/outbox.dispatcher.ts`, Queue dispatcher, Cron scheduled jobs, Queue bindings, and DLQ config.
- Implemented semantic senders: `sendOtpEmail`, `sendWelcomeEmail`, `sendGoogleLinkedEmail`, `sendOrderConfirmationEmail`, `sendShippingUpdateEmail`, `sendDropLaunchEmail`, `sendOtpSms`, `sendOrderConfirmationSms`, `sendShippingUpdateSms`, `sendPaymentUpdateSms`, `sendOrderStatusUpdateSms`, `sendDropLaunchSms`.
- Implemented outbox notification types: `auth_welcome`, `auth_google_linked`, `order_confirmation`, `shipping_update`, `payment_update`, `order_status_update`, `drop_launch`.
- SMS sender purposes: `otp` uses `TEXT_LK_OTP_SENDER_ID`, `transactional` uses `TEXT_LK_TRANSACTIONAL_SENDER_ID`, and `promotional` uses `TEXT_LK_PROMOTIONAL_SENDER_ID`.

## Architecture Rules

- Classify server files before editing: domain, infrastructure, foundation, or orchestration.
- Use current canonical import paths; do not invent alternate layer paths or legacy shims.
- Routes must not import `db`, Drizzle tables, Drizzle query helpers, or R2 primitives.
- Exception: `src/routes/media/[...key]/+server.ts` may import media R2 helpers because it is the media delivery endpoint.
- `+page.server.ts` files may call service functions, form schemas, and route error adapters only.
- Business writes must go through `*.service.ts`.
- Multi-table writes must use transactions.
- Cross-module transaction helpers should remain internal unless a public export is intentionally approved.
- Inventory module APIs may manage variant stock rows; `inventoryMovement` remains append-only audit state and is not generic CRUD.
- Bag DTOs distinguish active competing checkout holds from true unavailability and may expose only hold expiry timing, never competing shopper identity.
- Product create/update workflows may curate product tags, draft variants, product images, and non-archived drop assignment through `products.service.ts`; routes must not write product junction/media tables directly.
- Product image uploads must pass through product services with validated image metadata, draft-variant client ID mapping where needed, and R2 compensation cleanup.
- R2 uploads must use compensation cleanup.
- Use existing `AppError`, `ErrorCode`, and domain error classes. Do not create a second error framework.
- Use `$lib/shared/modules/access-control` for Better Auth role/access-control definitions and server guards in `src/lib/server/foundation/guards.ts`.
- Do not import from `$lib/client/*` inside server modules, services, cron jobs, Queue handlers, or notification modules.
- Server modules that need app URL/app name/provider secrets must use `getEnv()` from `$lib/server/infrastructure/env`.
- Do not expose generic CRUD for audit/internal/junction tables such as inventory movements, promo usage, order status history, notification outbox, product-tag joins, or drop-product joins.

## Notification Rules

- Email and SMS modules are infrastructure helpers, not durable domain-state owners.
- DB `notification_outbox` is the durable source of truth for async notification state.
- Domain services enqueue outbox intent inside the same DB transaction as the business state change.
- Exception: auth welcome and Google-linked lifecycle emails use outbox rows from Better Auth database hooks; OTP SMS remains synchronous/direct where the auth flow expects thrown failures.
- Queue messages contain only `outboxId` and/or `idempotencyKey`, never full payloads or customer PII.
- Cloudflare Queues are fast wakeups only.
- Cloudflare Cron retries pending, due failed, and stale locked outbox rows.
- DLQ is operational review only; DB outbox remains audit/retry state.
- Queue/Cron/job/orchestration code sends email/SMS and marks records sent only after successful typed send results.
- Treat `src/lib/server/infrastructure/notifications/outbox.dispatcher.ts` as orchestration, not durable state ownership.
- Do not put actual email/SMS sending inside domain services unless explicitly approved.
- Prefer semantic senders over inline message construction.
- Normal delivery failures return `EmailResult` or `SmsResult`; auth OTP helpers may throw only where existing auth flow expects it.
- Failed email/SMS sends must not mark waitlist entries or notification records as sent.
- Cloudflare KV must not be used as notification outbox; it is only acceptable for short-lived soft state such as OTP cooldowns.
- SMS senders must set correct `senderPurpose`: OTP auth uses `otp`, order/payment/delivery/status uses `transactional`, drops/new arrivals/offers/campaigns use `promotional`.

## Required Workflow

1. Inspect relevant files first.
2. Produce a plan before editing.
3. For new services, first produce a service API plan covering storefront, admin dashboard, checkout/account, Queue/Cron/job, support, notification, and related-system needs.
4. Edit the smallest safe file set.
5. Run typecheck/lint/tests or targeted validation where available.
6. Summarize changed files, validation commands, failures, risks, and follow-up work.

## Anti-Hallucination Rules

- Never assume a helper exists. Search before using it.
- Never invent import paths.
- Never change schema behavior unless explicitly asked.
- If a dependency API is uncertain, use Context7 MCP or Svelte MCP before coding.
- If tests fail, fix the cause. Do not weaken tests or remove checks.
- If implementation conflicts with schema comments, stop and explain the conflict.
- If notification behavior conflicts with `docs/service-layer-architecture.md`, stop and explain the conflict before editing.
