# CaroClothing Service Layer Architecture

- **Audience:** project collaborators and Codex agents
- **Status:** current as of 2026-07-13
- **Scope:** server services, route boundaries, forms, authorization, errors, R2 media, notification outbox, Cloudflare Queue/Cron orchestration, and validation rules

The repository-wide `src/lib` dependency and folder rules live in `docs/library-architecture.md`.

## Current State

Implemented public service modules:

```txt
auth
addresses
products
wishlist
bag
shipping
promotions
inventory
orders
payments
reviews
```

`inventory` is a public admin service module for stock dashboard workflows. It exposes curated inventory reads, initialization, settings updates, restock, and adjustment APIs through `src/lib/server/modules/inventory/index.ts`. Internal `*Tx` helpers in `inventory.service.ts` still support bag/order transaction workflows and are imported directly by server internals when needed.

`payments` supports PayHere, PayPal, and cash on delivery only. PayHere checkout uses the official JavaScript SDK while signed server webhooks own payment truth. PayPal checkout uses JavaScript SDK v6 with server-created and server-captured Orders API transactions. Online checkout persists only a `payment_attempt` before provider success; no order/payment row or stock reservation exists yet. Verified capture revalidates the live bag and atomically creates and confirms the order, records the captured payment, consumes stock, deletes the bag, and enqueues confirmation intent. Cash-on-delivery confirmation still occurs at placement.

Bag and checkout inventory lifecycle:

- Adding, removing, or changing bag items does not reserve stock.
- `startCheckout` validates the bag and opens a 10-minute checkout window without reserving stock.
- Bag additions and upward quantity changes reject desired line quantities above tracked available stock unless backorders are allowed.
- A stale line that exceeds available stock is labelled `insufficient` with its exact available quantity, not `out of stock`; customers can still reduce it.
- Bag availability uses bounded visible-tab refreshes, stale-on-focus refreshes, and a projection refresh after a known hold deadline.
- The selected product-detail variant is seeded by its server-rendered snapshot, then uses bounded visible-tab refreshes, failure backoff, stale-on-focus refreshes, and the same checkout-aware status and hold countdown as the bag. A deadline refresh removes the expired hold from the projection; bounded Cron releases authoritative reserved inventory within the following minute.
- Re-entering an active checkout keeps its original deadline.
- Navigating away from checkout or mutating the bag cancels the checkout window without clearing bag items.
- Checkout expiry clears checkout timestamps; new checkout windows hold no stock. Cleanup still safely releases any legacy reservation references.
- Online provider setup creates a `payment_attempt` only. Failure or cancellation leaves the bag intact and creates no order or reservation.
- Verified capture reserves order-item quantities and consumes them during the same order-confirmation transaction before deleting the bag.
- Cron expires due checkout windows every minute. Availability and bag-hydration projections never release another shopper's reservations.
- Storefront availability combines bounded read-only projections without opening a libSQL write transaction. A concurrent checkout can make one projection momentarily stale; checkout/order write transactions remain authoritative and revalidate stock.

Customer account lifecycle:

- Phone sign-up uses a neutral temporary display name and requires the customer to enter a real name before continuing.
- Existing phone-derived display names are treated as incomplete and redirected to account profile completion.
- A customer must always retain at least one sign-in method: verified phone or Google.
- Self-service account deletion requires a fresh Better Auth session.
- Before account deletion, the auth workflow releases checkout reservations, deletes the bag, cancels unsent notification outbox rows, and anonymizes customer PII from retained orders in one transaction.
- User deletion cascades profile-owned data while anonymized order/payment history remains with a null user reference.
- Review media keys are collected before deletion and removed from R2 after the database deletion succeeds.

Implemented foundations:

```txt
src/lib/server/foundation/context.ts
src/lib/server/foundation/guards.ts
src/lib/server/foundation/utils.ts
src/lib/server/infrastructure/errors/route-adapter.ts
```

Implemented notification infrastructure:

```txt
src/lib/server/modules/notifications/outbox
src/lib/server/orchestration/notifications
src/lib/server/orchestration/cron
src/lib/server/infrastructure/cloudflare
```

`notification_outbox` is the durable source of truth for async notification state. Cloudflare Queues are wakeups only. Cron retries pending, due failed, and stale locked outbox rows. DLQ is operational review only.

Implemented semantic notification senders include:

```txt
sendOtpEmail
sendWelcomeEmail
sendGoogleLinkedEmail
sendOrderConfirmationEmail
sendShippingUpdateEmail
sendOtpSms
sendOrderConfirmationSms
sendShippingUpdateSms
sendPaymentUpdateSms
sendOrderStatusUpdateSms
```

Implemented outbox notification types:

```txt
auth_welcome
auth_google_linked
order_confirmation
shipping_update
payment_update
order_status_update
```

SMS sender purposes are configured by Text.lk sender ID:

```txt
otp             -> TEXT_LK_OTP_SENDER_ID           # Caro OTP
transactional   -> TEXT_LK_TRANSACTIONAL_SENDER_ID # Caro
promotional     -> TEXT_LK_PROMOTIONAL_SENDER_ID   # Caro Promo
```

When this document conflicts with code, inspect code before editing and update the stale guidance as part of the change.

## Layer Map

Canonical server layers:

```txt
Database:
  src/lib/server/db

Foundation:
  src/lib/server/foundation/context.ts
  src/lib/server/foundation/guards.ts
  src/lib/server/foundation/utils.ts
  src/lib/shared/auth/access-control.ts

Infrastructure:
  src/lib/server/infrastructure/env
  src/lib/server/infrastructure/errors
  src/lib/server/infrastructure/media
  src/lib/server/infrastructure/email
  src/lib/server/infrastructure/sms
  src/lib/server/infrastructure/cloudflare

Orchestration:
  src/lib/server/orchestration/notifications
  src/lib/server/orchestration/cron

Domain modules:
  src/lib/server/modules/auth
  src/lib/server/modules/addresses
  src/lib/server/modules/bag
  src/lib/server/modules/inventory
  src/lib/server/modules/notifications/outbox
  src/lib/server/modules/orders
  src/lib/server/modules/products
  src/lib/server/modules/promotions
  src/lib/server/modules/reviews
  src/lib/server/modules/shipping
  src/lib/server/modules/wishlist
```

Layer rules:

- Domain modules own business state, Drizzle schemas, service functions, DTOs, and domain validation.
- Infrastructure modules wrap technical providers and runtime adapters such as env, errors, R2, Resend, Text.lk, and Cloudflare Queue/Cron bindings.
- Foundation modules hold cross-cutting service context, guards, and utilities.
- Cloudflare infrastructure adapters translate Worker runtime events and bindings into plain orchestration calls.
- Orchestration modules run Queue/Cron/job workflows without depending on Cloudflare runtime message/controller types.
- `modules/auth` is intentionally mixed because Better Auth runtime/config and auth domain behavior live together.
- `modules/notifications/outbox` is a domain state module because it owns `notification_outbox`, idempotency, retry/audit state, payload validation, and claim/mark/cancel APIs.
- `src/lib/server/orchestration/notifications` is orchestration because it claims rows through the outbox service and calls semantic senders.

Do not invent alternate layer paths or legacy shims.

## Boundaries

Request flow:

```txt
Drizzle schema files
  -> database tables, relations, constraints, base Zod schemas, inferred DB types

Form schema files
  -> Superforms schemas, file inputs, UI-only fields, form-level validation

Service files
  -> business logic, authorization, transactions, R2 side effects, notification intent, domain errors, DTO mapping

Route files
  -> load data, create forms, validate actions, call services, map service errors

Components
  -> render UI and interaction only
```

Route rules:

- Business routes must not import `db`, Drizzle tables, Drizzle query helpers, or R2 primitives.
- `+page.server.ts` files may use service functions, module form schemas and public types, type-only `ServiceContext`, route error adapters, and `createCloudflareNotificationWakeups` from the Cloudflare infrastructure adapter.
- Routes pass the notification wakeup publisher interface through `ServiceContext`; they do not pass raw Queue bindings into domain services.
- `src/routes/media/[...key]/+server.ts` is the only approved route exception for media R2 helpers.
- Routes must not call email/SMS senders directly unless a task explicitly approves a narrow synchronous notification.
- Routes must not put notification payloads or customer PII into Queue messages.

Service rules:

- Business writes must go through `*.service.ts`.
- Multi-table writes must use transactions.
- Cross-module transaction workflows should use internal `*Tx` helpers imported directly by server internals, not exported as public module CRUD.
- Background/cron/cleanup tasks that process multiple items must NOT run the entire batch under a single monolithic transaction. Instead, select the targeted rows first, then process each record individually within its own transaction. This prevents database timeouts, lock contention, and worker runtime termination on Cloudflare.
- Account deletion may use narrowly scoped internal bag, review media, and notification outbox helpers; these are not generic public CRUD APIs.
- Inventory APIs may manage variant inventory rows, but `inventoryMovement` remains append-only audit state and must not be exposed as generic CRUD.
- Services return DTOs when UI needs derived fields or public URLs.
- Public reads default to public-safe filtering.
- Reads that expose inactive, archived, unpublished, moderation, or admin-only data must accept `ServiceContext` and enforce authorization.
- Do not expose generic CRUD for audit/internal/junction tables such as inventory movements, promo usage, order status history, notification outbox, or product-tag joins.

Product service contract:

- `products.service.ts` owns product creation across product rows, selected tags, newly created tags, draft variant colors, draft variants (sizes), and product images. Admin routes must call `createProduct()` instead of writing any of those tables directly.
- Product form schemas may include UI-only create fields such as `newTagNames`, `images`, `primaryImageIndex`, draft variant colors (`variants`), `imageMetadata`, and route `redirectTo`. Services strip and validate these fields before persistence.
- Draft variant colors use client-side `clientId` values during create so image metadata and size-level variants can target a specific color card before the database ID exists. The service generates product, variant color, and variant size IDs, maps client IDs to variant color IDs, and rejects duplicate draft client IDs or duplicate color names.
- Product image metadata must match the uploaded file count. Each image can set `variantColorClientId`, `altText`, `position`, and `isPrimary`; the service enforces valid variant color mapping, nonnegative positions, alt text length, and one primary image per color card scope.
- Product image uploads are service-owned R2 side effects associated with a `productVariantColor` (color card) row via `variantColorId`. Routes pass `ctx.event`; the service uploads with generated product/color/variant IDs and deletes uploaded objects if a later validation or transaction step fails.
- Product edit workflows use `updateProductFull()` for full-form synchronization of product rows, tags, variant color cards, size variants, new image uploads, image deletion, primary image state, image alt text, and image `position` display order. Admin edit routes serialize UI image metadata and must not write product image rows directly.
- `ProductDTO` includes variants, images, tags, and resolved `primaryImageUrl` so admin/storefront routes do not need cross-table joins.

## Errors, Auth, Env, And Media

Errors:

- Use `src/lib/server/infrastructure/errors/index.ts`.
- Throw existing `AppError`, `ErrorCode`, and domain error classes.
- Do not throw raw strings or create a second error framework.
- Routes convert AppErrors through `src/lib/server/infrastructure/errors/route-adapter.ts`.
- Unexpected errors should be rethrown for SvelteKit/observability.

Authorization:

- Use `$lib/shared/auth/access-control` for Better Auth role/access-control definitions.
- Use `src/lib/server/foundation/guards.ts` for server-side authorization.
- Server services are the source of truth; UI access checks are only convenience.
- Role names are `adminUser` and `customerUser`.

Service context:

```ts
type ServiceContext = {
	actor?: ServiceActor | SystemActor | null;
	event?: Pick<RequestEvent, 'platform'>;
	notificationWakeups?: NotificationWakeupPublisher | null;
	now?: Date;
	requestId?: string;
};
```

Use only the context fields a service needs. R2 uploads need `ctx.event`. Queue wakeups use `ctx.notificationWakeups`, a publisher interface created by the Cloudflare adapter. Cron passes a `SystemActor`, explicit `now`, and a wakeup publisher when available.

Environment:

- Server modules must not import from `$lib/client/*`.
- Server app config and provider secrets come from `getEnv()` in `$lib/server/infrastructure/env`.
- Required server/public env values include `PUBLIC_APP_NAME`, `PUBLIC_APP_URL`, `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`, Text.lk API key, and purpose-specific Text.lk sender IDs.

Media:

- Use `src/lib/server/infrastructure/media/r2.ts` and `src/lib/server/infrastructure/media/utils.ts`.
- Use `getMediaBucket`, `buildMediaKey`, `uploadImage`, and `deleteObjectSafe`.
- Services that upload media must clean up uploaded R2 objects if the later DB transaction fails.
- Services that replace or delete media should update DB state first, then best-effort cleanup old keys with `deleteObjectSafe`.
- DTOs expose media URLs with `mediaUrl(key)`, not raw R2 keys unless admin/debug use requires both.

## Notification Contract

State ownership:

- Email and SMS modules are infrastructure helpers, not durable state owners.
- `src/lib/server/modules/notifications/outbox` owns durable async notification state.
- Do not add extra notification DB tables unless the architecture is intentionally changed.
- Do not move outbox into infrastructure while it owns schema/service/types, idempotency, retry/audit state, and payload validation.

Domain services:

- Enqueue outbox intent inside the same DB transaction as the business state change.
- Use unique idempotency keys.
- Do not send email/SMS directly unless explicitly approved.
- For legacy workflows, expose idempotent list/mark helpers rather than sending from routes.
- Exception: auth welcome and Google-linked lifecycle emails enqueue outbox rows from Better Auth database hooks. These hooks run after the auth state change, so enqueue failures are logged and non-blocking; any inserted row is still recoverable by Cron if Queue wakeup fails.

Queue:

- Queue publish is best-effort after commit.
- Queue messages contain only `outboxId` and/or `idempotencyKey`.
- Domain services receive a notification wakeup publisher interface, not a raw Cloudflare Queue binding.
- Queue consumers must claim the outbox row before sending.
- Duplicate Queue delivery must not duplicate notification sends when the outbox row is already terminal or locked.
- Queue processing marks records sent only after `EmailResult.ok` or `SmsResult.ok`.
- Provider failures mark outbox state failed/retryable without marking sent.

Cron:

- Cron scans pending due rows, due failed rows, and stale locked rows.
- Cron also routes configured scheduled service jobs such as pending-payment cancellation, guest-bag cleanup, and promo usage reconciliation.
- Cron/job code must be idempotent, limit-aware, retry-safe, explicit about `now`, and free of `$lib/client/*` imports.

Sender rules:

- Prefer semantic senders over inline message construction.
- Normal delivery failures return `EmailResult` or `SmsResult`; they do not throw.
- OTP auth helpers may throw only where the existing auth flow expects thrown failures; current OTP SMS remains synchronous/direct for that Better Auth path.
- SMS semantic senders choose `senderPurpose`; outbox payloads and Queue messages should not carry provider sender IDs.
- OTP auth uses `otp`, order/payment/delivery/status SMS uses `transactional`, and new arrivals/offers/campaigns use `promotional`.
- Failed email/SMS sends must not mark notification records as sent.
- Cloudflare KV must not be used as notification outbox; it is acceptable only for short-lived soft state such as OTP cooldowns.

## Validation Checklist

Run the smallest relevant checks first, then broaden when risk is high:

```powershell
pnpm check
pnpm lint
git diff --check
rg -n '\$lib/server/db|drizzle-orm|\.drizzle|media/r2' src/routes
rg -n '\$lib/client' src/lib/server
$legacyLayer = 'src/lib/server/modules/'
$legacyTerms = @('env', 'errors', 'media', 'queue', 'cron', ('service-' + 'context'), ('service-' + 'utils'))
$legacyTerms | ForEach-Object { rg -n ([regex]::Escape($legacyLayer + $_)) docs .gemini AGENTS.md }
```

Expected route R2 finding:

```txt
src/routes/media/[...key]/+server.ts
```

Before completing service-layer work, verify:

- Every business module with a `*.drizzle.ts` file has a `*.service.ts` file or a documented reason not to.
- Every business route write calls a service.
- Every multi-table write uses a transaction.
- Inventory writes create movement rows.
- Order status changes create history rows.
- Promo usage updates usage records and counts atomically.
- R2 upload/update/delete paths include compensation cleanup.
- DTOs convert media keys to `/media/...` URLs.
- Privileged reads and writes enforce server-side guards.
- Queue/Cron/orchestration code calls services and semantic notification senders only.
- Queue payloads contain outbox identifiers, not customer payloads or PII.
- Notification modules do not import from `$lib/client/*`.
- AppErrors are mapped consistently in route actions.
- Raw unexpected errors are not swallowed.

## Agent Rules

When implementing against this architecture:

1. Read `docs/codex-service-layer-workflow.md` before planning service APIs.
2. Inspect relevant schemas, services, routes, and helpers before coding.
3. Produce a service API plan before adding a new service.
4. Keep schemas, forms, services, routes, and components in their separate roles.
5. Preserve current import paths and layer ownership.
6. Use existing helpers; search before importing anything.
7. Stop and explain conflicts between schema comments, docs, and code before editing behavior.
