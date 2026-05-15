# CaroClothing Service Layer Architecture Plan

**Audience:** project collaborators and LLM coding agents  
**Status:** validated development-ready architecture plan - updated with Codex workflow/current-code snapshot on 2026-05-09
**Scope:** server module services, route boundaries, forms, access control, errors, R2 media, notification outbox, Cloudflare Queues, cron workflows, and module-by-module implementation order

## Validation Notes From Final Review

This version includes the final validation pass. The main corrections applied are:

1. Privileged read APIs now accept an optional `ServiceContext` when options can expose inactive, archived, unpublished, or admin-only data. Public reads must default to public-safe results.
2. New server services and cron services must not import from `$lib/client/*`. If a server-side workflow needs public app configuration such as `PUBLIC_APP_URL`, extract that helper into a server-safe or shared module.
3. The Cloudflare scheduled-handler workaround should remain project-specific and should be revalidated whenever `@sveltejs/adapter-cloudflare` is upgraded.
4. R2 cleanup should rely on the project `deleteObjectSafe` wrapper, not direct bucket deletion from feature services.
5. Notification workflows now use a durable outbox contract: domain services write notification intent inside the database transaction, Cloudflare Queues provide fast asynchronous wakeups, Cloudflare Cron provides retry/reconciliation fallback, and delivery state is marked sent only after successful email/SMS delivery.

---

## Current Implementation Snapshot

This document describes the target service-layer architecture and must stay aligned with current code. As of 2026-05-09:

```txt
Implemented service modules:
- src/lib/server/modules/auth/auth.service.ts
- src/lib/server/modules/addresses/addresses.service.ts
- src/lib/server/modules/products/products.service.ts
- src/lib/server/modules/drops/drops.service.ts
- src/lib/server/modules/wishlist/wishlist.service.ts
- src/lib/server/modules/cart/cart.service.ts
- src/lib/server/modules/shipping/shipping.service.ts
- src/lib/server/modules/promotions/promotions.service.ts
- src/lib/server/modules/orders/orders.service.ts
- src/lib/server/modules/reviews/reviews.service.ts

Implemented internal service helpers:
- src/lib/server/modules/inventory/inventory.service.ts
  - currently consumed directly by cart/order-style transaction code;
  - module index exports inventory schema/types only, not a public CRUD API.

Implemented foundation helpers:
- src/lib/server/modules/service-context.ts
- src/lib/server/modules/auth/guards.ts
- src/lib/server/modules/service-utils.ts

Schema-only business modules still needing services:
- None in the current core service rollout.

Known route debt:
- No known business route direct-DB imports after the account route refactor.

Implemented notification infrastructure:
- src/lib/server/modules/notifications/outbox
  - durable source of truth for async notification state;
  - approved narrow exception to the normal "do not add notification DB tables" rule.
- Cloudflare Queue producer/consumer bindings, Queue handler wiring, Cron retry/reconciliation, and DLQ configuration are implemented for notifications.

Notification sender state:
- sendDropLaunchEmail exists and is exported.
- sendDropLaunchSms exists and is exported.
```

When this document conflicts with code, stop and inspect the relevant files before editing runtime code.

---

## 1. Purpose

CaroClothing currently has strong Drizzle schema modules under `src/lib/server/modules/*`. Many of those schema files already encode important database constraints and comments that say certain rules must be enforced at the application layer.

This plan defines the service-layer architecture that will sit between SvelteKit routes and Drizzle. The goal is to make business logic explicit, testable, reusable, and safe across admin pages, storefront pages, checkout, cron jobs, webhooks, and future API endpoints.

The service layer must become the only normal place where business workflows talk to the database.

---

## 2. Current Project Facts This Plan Aligns With

The current architecture already includes:

```txt
src/lib/server/modules/errors/index.ts
src/lib/server/modules/media/r2.ts
src/lib/server/modules/media/utils.ts
src/lib/server/modules/auth/index.ts
src/lib/server/modules/cron/scheduled-jobs.ts
src/lib/server/modules/queue
src/lib/server/modules/notifications/outbox
src/lib/server/modules/notifications/email
src/lib/server/modules/notifications/sms
src/lib/shared/modules/access-control.ts
```

Important existing conventions:

1. `src/lib/shared/modules/access-control.ts` is shared by both Better Auth client and server configuration.
2. Better Auth uses role names such as `adminUser` and `customerUser`.
3. `src/lib/server/modules/errors/index.ts` already has `AppError`, domain-specific error classes, stable `ErrorCode` values, HTTP status mapping, and Better Auth conversion helpers.
4. R2 media helpers already exist and are event/bucket based.
5. Media is served through `/media/[...key]` using safe R2 key validation.
6. `src/lib/server/modules/cron/scheduled-jobs.ts` is the active scheduled-job router for configured Cloudflare cron expressions.
7. Notification modules expose typed email/SMS send primitives and semantic senders such as `sendDropLaunchEmail` and `sendDropLaunchSms`.
8. The implemented notification outbox is the durable source of truth for async notification state. Cloudflare Queues are a delivery accelerator, not durable business history.
9. `src/lib/server/modules/queue` is the active Cloudflare Queue router. Cloudflare Queue bindings, Queue consumers, Cron recovery, and DLQ configuration are implemented for notification workflows.
10. Better Auth anonymous account linking routes through `src/lib/server/modules/auth/anonymous-migration.ts`, which internally merges cart, wishlist, and drop waitlist ownership after validating the source is anonymous and the target is a full account.

Do not replace these foundations. Extend them.

---

## 3. Architecture Summary

```txt
Drizzle schema files
  -> database tables, relations, constraints, base Zod schemas, inferred DB types

Form schema files
  -> SvelteKit Superforms schemas, file inputs, UI-only fields, form-specific validation

Service files
  -> business logic, authorization, transactions, R2 side effects, domain errors, DTO mapping

Route files
  -> load data, create forms, validate actions, call services, handle redirects/messages

Components
  -> render UI only
```

---

## 4. Non-Negotiable Rules

### 4.1 Routes must not access Drizzle directly

`+page.server.ts`, `+layout.server.ts`, and route actions must not import:

```ts
db;
getDb;
eq;
and;
sql;
category;
product;
cart;
order;
inventory;
uploadImage;
buildMediaKey;
```

Routes should import service functions and form schemas only.

Exception:

```txt
src/routes/media/[...key]/+server.ts may import media R2 helpers because it is the media delivery endpoint, not a business route.
```

Allowed route imports once the referenced helpers exist:

```ts
import { createCategory, listCategories } from '$lib/server/modules/products';
import { createCategoryFormSchema } from '$lib/server/modules/products/products.forms';
import { failFromAppError } from '$lib/server/modules/errors/route-adapter';
```

### 4.2 Services own business writes

Any database write that changes business state must go through a service function.

Examples:

```txt
products.service.ts
cart.service.ts
inventory.service.ts
orders.service.ts
promotions.service.ts
drops.service.ts
reviews.service.ts
shipping.service.ts
addresses.service.ts
wishlist.service.ts
```

### 4.3 Internal/audit tables do not get public CRUD APIs

Do not expose generic create/update/delete functions for audit, join, or workflow-owned tables.

Examples:

| Table                | Direct CRUD? | Use these workflow functions instead                                            |
| -------------------- | -----------: | ------------------------------------------------------------------------------- |
| `inventoryMovement`  |           No | `reserveInventory`, `releaseInventory`, `restockVariant`, `recordInventorySale` |
| `orderStatusHistory` |           No | `transitionOrderStatus`, `placeOrderFromCart`, `cancelOrder`                    |
| `promoCodeUsage`     |           No | `recordPromoUsage`, `applyPromoCodeToCart`, `placeOrderFromCart`                |
| `productTag`         |           No | `setProductTags`, `addProductTag`, `removeProductTag`                           |
| `dropProduct`        |           No | `setDropProducts`, `setDropHeroProduct`                                         |
| `reviewMedia`        |    Mostly no | `addReviewMedia`, `deleteReviewMedia`                                           |

### 4.4 Services throw typed domain errors

Services should throw the existing domain errors from `src/lib/server/modules/errors/index.ts`, for example:

```ts
throw new ProductError('Category not found.', ErrorCode.CATEGORY_NOT_FOUND);
throw new InventoryError('Insufficient stock.', ErrorCode.INSUFFICIENT_STOCK, { variantId });
throw new AuthError('Admin access required.', ErrorCode.INSUFFICIENT_PERMISSIONS);
```

Do not throw raw strings. Avoid leaking low-level Drizzle or R2 errors to routes.

### 4.5 Services enforce access control

Client-side access control is only for UI visibility. Server services are the source of truth.

Use the shared Better Auth access-control file for role definitions, but place server-only guard helpers in a server module so they can throw server errors safely.

Recommended file:

```txt
src/lib/server/modules/auth/guards.ts
```

---

## 5. Recommended Shared Types

Create:

```txt
src/lib/server/modules/service-context.ts
```

```ts
import type { RequestEvent } from '@sveltejs/kit';

export type ServiceActor = {
	id: string;
	role: 'adminUser' | 'customerUser' | string | null;
	isAnonymous?: boolean | null;
};

export type SystemActor = {
	id: `system:${string}`;
	role: 'adminUser';
};

export type ServiceContext = {
	actor?: ServiceActor | SystemActor | null;
	event?: Pick<RequestEvent, 'platform'>;
	now?: Date;
	requestId?: string;
};
```

Why this is needed:

1. Media uploads need access to the Cloudflare R2 binding from `event.platform`.
2. Cron jobs need a system actor and explicit `now`.
3. Tests can inject `now` and actor data without relying on real request state.
4. Services can share one consistent call shape.

For functions that do not need R2 or auth, accept only the specific fields needed. Do not over-require full `RequestEvent`.

If a read function has options that can expose non-public data, such as `includeInactive`, `includeArchived`, unpublished drops, internal promo details, or moderation queues, the read function must accept `ServiceContext | null` and enforce permissions before returning that data. Public calls should default to public-safe filtering.

---

## 5.1 Server-Safe Public Environment Access

Server modules, service modules, notification modules, and cron jobs must not import from `$lib/client/*`.

If a server-side workflow needs public application values such as app name or app URL, use the server env module:

```ts
import { getEnv } from '$lib/server/modules/env';
```

`getEnv()` should expose the public values needed by server workflows, such as:

```txt
PUBLIC_APP_NAME
PUBLIC_APP_URL
```

It should also expose server-only secrets used by infrastructure modules, such as:

```txt
RESEND_API_KEY
EMAIL_FROM_ADDRESS
TEXT_LK_API_KEY
TEXT_LK_SENDER_ID
```

Guidelines:

```txt
- New server services must not import from `$lib/client/*`.
- Notification templates and senders must use `$lib/server/modules/env` or another server-safe/shared helper.
- Cron jobs that build public URLs must use `getEnv().PUBLIC_APP_URL` or a server-safe wrapper around it.
- Do not pass secrets through client/shared modules.
```

---

## 6. Server Access-Control Guards

Create:

```txt
src/lib/server/modules/auth/guards.ts
```

This file imports shared role/access-control definitions and converts permission failures into project errors.

Example:

```ts
import { AuthError, ErrorCode } from '$lib/server/modules/errors';
import type { ServiceActor } from '$lib/server/modules/service-context';

export function requireActor(actor: ServiceActor | null | undefined): ServiceActor {
	if (!actor) {
		throw new AuthError('Sign in to continue.', ErrorCode.AUTHENTICATION_REQUIRED);
	}

	if (actor.isAnonymous) {
		throw new AuthError('A full account is required.', ErrorCode.AUTHENTICATION_REQUIRED);
	}

	return actor;
}

export function requireAdmin(actor: ServiceActor | null | undefined): ServiceActor {
	const resolved = requireActor(actor);

	if (resolved.role !== 'adminUser') {
		throw new AuthError('Admin access required.', ErrorCode.INSUFFICIENT_PERMISSIONS);
	}

	return resolved;
}

export function requireOwnerOrAdmin(
	actor: ServiceActor | null | undefined,
	ownerUserId: string | null | undefined
): ServiceActor {
	const resolved = requireActor(actor);

	if (resolved.role === 'adminUser') return resolved;
	if (ownerUserId && resolved.id === ownerUserId) return resolved;

	throw new AuthError('You do not have permission to access this resource.', ErrorCode.FORBIDDEN);
}
```

Use `adminUser` and `customerUser` consistently because Better Auth is configured with those role names.

---

## 7. Error Handling Plan

The existing `errors/index.ts` is already the canonical error system. Keep it.

Planned helper, not currently present as of 2026-05-05:

```txt
src/lib/server/modules/errors/route-adapter.ts
```

```ts
import { fail, error as kitError } from '@sveltejs/kit';
import type { SuperValidated } from 'sveltekit-superforms';
import { message } from 'sveltekit-superforms';
import { isAppError, toErrorResponseBody } from './index';

export function failFromAppError(error: unknown) {
	if (!isAppError(error)) throw error;

	return fail(error.statusCode, {
		error: toErrorResponseBody(error, { includeDetails: error.statusCode < 500 })
	});
}

export function throwHttpFromAppError(error: unknown): never {
	if (!isAppError(error)) throw error;

	const body = toErrorResponseBody(error, { includeDetails: error.statusCode < 500 });
	throw kitError(error.statusCode, body.message);
}
```

Optional Superforms-specific helper:

```ts
export function formFailFromAppError<T extends Record<string, unknown>>(
	form: SuperValidated<T>,
	error: unknown
) {
	if (!isAppError(error)) throw error;

	const body = toErrorResponseBody(error, { includeDetails: error.statusCode < 500 });

	return message(form, body.message, {
		status: error.statusCode
	});
}
```

Guidelines:

1. Domain services throw `ProductError`, `CartError`, `OrderError`, etc.
2. Auth/permission failures throw `AuthError`.
3. Route actions convert AppErrors to SvelteKit/Superforms responses.
4. Better Auth hooks continue using `toBetterAuthApiError`.
5. Unexpected errors should be rethrown so SvelteKit/observability can capture them.

---

## 8. Media and R2 Plan

The existing media module already has:

```txt
src/lib/server/modules/media/r2.ts
src/lib/server/modules/media/utils.ts
src/routes/media/[...key]/+server.ts
```

Use the existing helpers:

```ts
getMediaBucket(event)
buildMediaKey(...)
uploadImage(bucket, key, file)
uploadMedia(bucket, key, file)
deleteObjectSafe(bucket, key)
mediaUrl(key)
```

### 8.1 Service functions that upload media must accept `ctx.event`

Example:

```ts
await createCategory(
	{
		actor: locals.user,
		event
	},
	input
);
```

Inside the service:

```ts
const bucket = getMediaBucket(ctx.event);
```

### 8.2 R2 + DB consistency pattern

R2 is outside the database transaction. It cannot be rolled back by Drizzle.

Use compensation logic:

#### Create with media

```txt
1. Generate entity ID.
2. Build R2 key using entity ID.
3. Upload file to R2.
4. Insert DB row with R2 key.
5. If DB insert fails, delete the uploaded object with deleteObjectSafe.
```

#### Update media

```txt
1. Read existing row and old R2 key.
2. Upload new file.
3. Update DB row to the new key.
4. If DB update succeeds, delete old object with deleteObjectSafe.
5. If DB update fails, delete newly uploaded object with deleteObjectSafe.
```

#### Delete entity with media

```txt
1. Read entity and collect R2 keys.
2. Delete DB row or soft-delete in a transaction.
3. After DB success, call deleteObjectSafe for each key.
4. Never fail the user request only because best-effort media cleanup failed.
```

### 8.3 Services return media URLs in DTOs

Database rows store keys. DTOs should include public URLs.

```ts
type CategoryDTO = {
	id: string;
	name: string;
	slug: string;
	imageR2Key: string | null;
	imageUrl: string | null;
};
```

---

## 8.4 Notification Services, Outbox, Queues, and Cron

The project has dedicated server-side notification infrastructure:

```txt
src/lib/server/modules/notifications/outbox   # durable state module
src/lib/server/modules/notifications/email
src/lib/server/modules/notifications/sms
src/lib/server/modules/queue                 # Cloudflare Queue router
src/lib/server/modules/cron/scheduled-jobs.ts # Cloudflare Cron router
Cloudflare Queue bindings and consumers        # delivery accelerator
Cloudflare Cron Triggers                       # scheduled retry/reconciliation
Cloudflare Dead Letter Queues                  # operational failure review
```

Cloudflare behavior that this plan relies on:

```txt
- Queues are at-least-once delivery, so consumers must be idempotent.
- Queue retry/DLQ behavior is operational transport, not durable business state.
- Cron Trigger schedules are UTC.
```

Reference current Cloudflare docs before changing queue limits, retry counts, handler wiring, or Wrangler binding syntax:

```txt
https://developers.cloudflare.com/queues/reference/delivery-guarantees/
https://developers.cloudflare.com/queues/configuration/batching-retries/
https://developers.cloudflare.com/queues/configuration/dead-letter-queues/
https://developers.cloudflare.com/workers/configuration/cron-triggers/
```

### 8.4.1 Production notification model

Use this model for async transactional and marketing notifications:

```txt
Database notification_outbox = durable source of truth
Cloudflare Queue = fast asynchronous wakeup
Cloudflare Cron = retry and reconciliation fallback
Cloudflare DLQ = operational failure bucket, not business history
```

Business services must not send email/SMS directly unless explicitly approved for a synchronous workflow such as an auth flow that already expects immediate delivery behavior.

Preferred split:

```txt
Domain service:
  - validates domain rules
  - writes business state
  - inserts notification intent into notification_outbox inside the same DB transaction
  - never calls email/SMS provider APIs

Queue/Cron orchestration:
  - claims pending outbox rows
  - calls semantic email/SMS senders
  - marks outbox rows sent only after EmailResult.ok or SmsResult.ok
  - records retryable failures without rolling back domain state
```

Queue publishing is best-effort after the database commit. It is not the source of truth because it cannot be committed atomically with the app database transaction. Cron must periodically scan pending, failed, and stale locked outbox rows so missed Queue publishes are recovered.

### 8.4.2 Notification outbox module

The outbox module is the approved narrow exception to the normal rule against adding notification database tables. Do not add separate per-feature notification state tables unless the architecture plan is updated again.

Minimum outbox state:

```txt
id
type              # order_confirmation, shipping_update, drop_launch, etc.
channel           # email | sms
recipient
recipientUserId
aggregateType     # order | drop | review | product | auth | campaign
aggregateId
idempotencyKey    # unique per intended notification
payload           # JSON for the semantic sender input
status            # pending | processing | sent | failed | cancelled
attempts
maxAttempts
nextAttemptAt
lockedAt
lockedBy
lockToken
sentAt
providerMessageId
lastError
createdAt
updatedAt
```

Outbox API requirements:

```txt
enqueueNotificationTx(tx, input)
getNotificationOutbox(ctx, input)
listNotificationOutbox(ctx, input)
getNotificationOutboxSummary(ctx, input)
claimNotification(ctx, input)
claimPendingNotifications(ctx, input)
markNotificationSent(ctx, input)
markNotificationFailed(ctx, input)
releaseStaleNotificationLocks(ctx, input)
cancelNotification(ctx, input)
toNotificationQueueMessage(row)
```

Rules:

```txt
- `idempotencyKey` must be unique.
- Queue message bodies contain only `outboxId` or `idempotencyKey`.
- Do not put full notification payloads, email addresses, phone numbers, or customer PII in Queue messages.
- Store delivery payload and audit state in the database outbox.
- Keep outbox APIs business-oriented; do not expose generic CRUD to routes.
- Use a system actor for cron/queue workers.
```

Existing module-owned state such as `drop_waitlist.notifiedAt` may remain until that workflow is intentionally migrated. New async notification workflows should prefer the outbox.

### 8.4.3 Cloudflare Queue contract

Cloudflare Queues are at-least-once delivery. Duplicate messages are expected, so consumers must be idempotent and always verify the outbox row before sending.

Queue consumer behavior:

```txt
1. Receive { outboxId } or { idempotencyKey }.
2. Load and claim the outbox row atomically.
3. If row is already sent/cancelled, ack and no-op.
4. Dispatch by outbox type/channel to a semantic sender.
5. If sender returns ok, mark sent and ack.
6. If provider returns a normal failure result, mark failed/retryable with nextAttemptAt and ack.
7. Queue messages are explicitly acked after processing/logging; DB outbox state plus Cron drives normal retry.
8. Cloudflare Queue retry/DLQ is only a safety net for unhandled handler-level failure.
```

Use Dead Letter Queues for operational review after Queue retry exhaustion. DLQ entries must not be treated as durable business history; the outbox row remains the source for audit, retry, and support tooling.

### 8.4.4 Cloudflare Cron contract

Cron jobs are responsible for time-based work and repair:

```txt
- scan pending outbox rows whose nextAttemptAt is due
- release stale processing locks
- requeue or process due notifications in bounded batches
- run failure reports from the database outbox
- run existing service jobs such as cart cleanup, order expiry, drop launch, and promo reconciliation
```

Cron jobs must be idempotent, batch-limited, explicit about `now`, independent per recipient, and safe to retry. Cron schedules are UTC.

Current active cron branches:

```txt
*/5 * * * *     # notification outbox recovery + due drop launch transitions
*/10 * * * *    # pending online payment order auto-cancel
0 * * * *       # expired guest cart cleanup and reservation release
17 20 * * *     # daily promo usage-count reconciliation; UTC
```

Do not document illustrative future workflows as active requirements unless matching service APIs and sender contracts exist. Current examples that align with code/contracts:

```txt
- order confirmation email through sendOrderConfirmationEmail
- shipping update email through sendShippingUpdateEmail
- drop launch email through sendDropLaunchEmail
- drop launch SMS through sendDropLaunchSms
```

Future examples such as back-in-stock, abandoned cart, review reminders, campaigns, and push notifications require their own service API and sender plans before implementation.

### 8.4.5 Email module contract

The email module exports its public API through:

```txt
src/lib/server/modules/notifications/email/index.ts
```

Core contract:

```ts
export type EmailResult = { ok: true; id: string } | { ok: false; error: string };
```

Normal email delivery failures should return `EmailResult` instead of throwing. This allows batch jobs to continue processing and prevents failed delivery attempts from being marked sent.

Auth-specific OTP email helpers may throw only if they are integrated with auth flows that expect thrown failures.

Semantic senders should be preferred over generic template calls inside queue/cron code:

```ts
sendOrderConfirmationEmail(...)
sendShippingUpdateEmail(...)
sendDropLaunchEmail(...)
```

Where the provider supports idempotency keys, the sender layer should accept and pass the outbox `idempotencyKey` or equivalent provider key to reduce duplicate deliveries if a worker crashes after provider send but before the DB row is marked sent.

### 8.4.6 SMS module contract

The SMS module exports its public API through:

```txt
src/lib/server/modules/notifications/sms/index.ts
```

Core contract:

```ts
export type SmsResult = { ok: true; messageId: string } | { ok: false; error: string };
```

Normal SMS delivery failures should return `SmsResult` instead of throwing.

Semantic SMS senders should be added as workflows need them. For drop launch notifications, the implemented shape is:

```ts
export type DropLaunchSmsInput = {
	to: string;
	dropName: string;
	dropUrl: string;
};

export async function sendDropLaunchSms(input: DropLaunchSmsInput): Promise<SmsResult>;
```

Use the exported `sendDropLaunchSms` from `src/lib/server/modules/notifications/sms/index.ts` for drop launch SMS. Do not invent order/shipping SMS senders without adding their types, templates/message rules, and exports first.

### 8.4.7 Server environment and storage rules

Notification, outbox, queue, and cron modules are server modules. They must not import from:

```txt
$lib/client/*
```

If notification code needs public app values or secrets, use:

```ts
import { getEnv } from '$lib/server/modules/env';
```

Required env values may include:

```txt
PUBLIC_APP_NAME
PUBLIC_APP_URL
EMAIL_FROM_ADDRESS
RESEND_API_KEY
TEXT_LK_API_KEY
TEXT_LK_SENDER_ID
```

Cloudflare KV must not be used as the notification outbox. KV is acceptable for short-lived soft state such as OTP cooldowns, but notification intent, retry state, audit state, and delivery state belong in the database outbox.

### 8.4.8 Progressive notification updates

Notification modules can be improved progressively as service modules need them.

Do not block service-layer development on a complete notification redesign. Instead:

```txt
1. Keep core send primitives typed.
2. Add semantic senders as approved workflows need them.
3. Keep senders returning typed results for ordinary delivery failures.
4. Keep domain state changes and outbox enqueueing in services.
5. Keep delivery orchestration in Queue consumers, Cron jobs, or approved webhooks.
6. Keep Cloudflare Queue/DLQ as operational transport, not business state.
```

---

## 9. Database Transaction Rules

Use transactions for any workflow that writes more than one row, touches inventory, touches money, or writes audit history.

Required transaction workflows:

```txt
- Create product with variants/images/tags
- Set product tags
- Add item to cart
- Update cart quantity
- Remove cart item
- Merge guest cart into user cart
- Reserve inventory
- Release inventory
- Restock or adjust inventory
- Place order
- Cancel order
- Transition order status
- Record payment/refund
- Apply promo code
- Record promo usage
- Reconcile promo usage count
- Assign products to drop
- Launch drop
- Mark waitlist entries notified
- Set default address
```

### 9.1 Transaction-aware internal helpers

Avoid nested transaction problems by splitting public and internal functions.

Pattern:

```ts
export async function placeOrderFromCart(ctx: ServiceContext, input: PlaceOrderInput) {
	const db = getDb();

	return db.transaction(async (tx) => {
		return placeOrderFromCartTx(tx, ctx, input);
	});
}

async function placeOrderFromCartTx(tx: Tx, ctx: ServiceContext, input: PlaceOrderInput) {
	// workflow steps
}
```

If `orders.service.ts` needs inventory behavior inside its transaction, call an internal `reserveInventoryTx`/`recordInventorySaleTx`, not a public function that starts a second transaction.

---

## 10. Forms vs Drizzle Schemas

`*.drizzle.ts` files should keep base DB schemas.

Create `*.forms.ts` when form input differs from DB input.

Example: category stores `imageR2Key`, but the admin form submits `image: File`.

```txt
src/lib/server/modules/products/products.forms.ts
```

```ts
import { z } from 'zod';
import { insertCategorySchema, updateCategorySchema } from './products.drizzle';
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from '$lib/server/modules/media/r2';

const imageFileSchema = z
	.instanceof(File)
	.refine((file) => file.size > 0, 'Image is empty.')
	.refine((file) => file.size <= MAX_IMAGE_BYTES, 'Image must be 5MB or less.')
	.refine((file) => ALLOWED_IMAGE_TYPES.has(file.type), 'Unsupported image type.');

export const createCategoryFormSchema = insertCategorySchema.omit({ imageR2Key: true }).extend({
	image: imageFileSchema.optional()
});

export const updateCategoryFormSchema = updateCategorySchema.omit({ imageR2Key: true }).extend({
	image: imageFileSchema.optional(),
	removeImage: z.boolean().optional()
});
```

Rule:

```txt
DB schemas validate database shape.
Form schemas validate user input shape.
Services convert user input shape into database shape.
```

---

## 11. Service File Layout

For each major module:

```txt
src/lib/server/modules/products/
  products.drizzle.ts
  products.forms.ts
  products.types.ts
  products.service.ts
  products.repository.ts        optional
  index.ts
```

For smaller modules:

```txt
src/lib/server/modules/wishlist/
  wishlist.drizzle.ts
  wishlist.service.ts
  index.ts
```

### File responsibilities

| File              | Responsibility                                                         |
| ----------------- | ---------------------------------------------------------------------- |
| `*.drizzle.ts`    | Tables, relations, DB constraints, base Zod schemas, DB inferred types |
| `*.forms.ts`      | Superforms schemas and UI/file input validation                        |
| `*.types.ts`      | Service input/output types and DTOs                                    |
| `*.repository.ts` | Optional reusable DB query helpers only                                |
| `*.service.ts`    | Business logic, authorization, transactions, R2, errors, DTO mapping   |
| `index.ts`        | Public exports                                                         |

---

## 12. Naming Conventions

### 12.1 Functions

Use camelCase:

```ts
createCategory;
getCategory;
listCategories;
updateCategory;
deleteCategory;
```

Avoid PascalCase service functions:

```ts
CreateCategory;
GetCategory;
```

### 12.2 Inputs

Use object inputs:

```ts
await createCategory(ctx, {
	data,
	image
});
```

Avoid long positional argument lists.

### 12.3 Lookup objects

Use strict lookup unions instead of many getter functions.

```ts
export type CategoryLookup = { id: string } | { slug: string } | { name: string };

export async function getCategory(lookup: CategoryLookup) {}
```

Do not allow `{ id, slug }` unless you explicitly define precedence. Prefer runtime validation for exactly one lookup key.

---

## 13. Route Pattern

Example `+page.server.ts`:

```ts
import { fail } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { createCategory, listCategories } from '$lib/server/modules/products';
import { createCategoryFormSchema } from '$lib/server/modules/products/products.forms';
import { formFailFromAppError } from '$lib/server/modules/errors/route-adapter';

export const load = async (event) => {
	return {
		categories: await listCategories({ actor: event.locals.user }, { includeInactive: true }),
		form: await superValidate(zod(createCategoryFormSchema))
	};
};

export const actions = {
	create: async (event) => {
		const form = await superValidate(event.request, zod(createCategoryFormSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			await createCategory(
				{
					actor: event.locals.user,
					event
				},
				form.data
			);

			return message(form, 'Category created successfully.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	}
};
```

Route responsibilities:

```txt
- Read request
- Validate form
- Call service
- Convert AppError to form/action response
- Redirect/message
```

Service responsibilities:

```txt
- Check permission
- Validate business invariants
- Upload/delete media
- Open transaction
- Query/write DB
- Return DTO
```

---

# 14. Module Plans

## 14.1 Products Module

Files:

```txt
src/lib/server/modules/products/products.drizzle.ts
src/lib/server/modules/products/products.forms.ts
src/lib/server/modules/products/products.types.ts
src/lib/server/modules/products/products.service.ts
src/lib/server/modules/products/index.ts
```

Schemas included in module:

```txt
category
product
productVariant
productImage
tag
productTag
```

### Product module responsibilities

```txt
- Category CRUD
- Product CRUD
- Variant CRUD
- Product image upload/delete/reorder
- Primary image selection
- Tag CRUD
- Product-tag assignment
- Catalog listing and product detail DTOs
- Media URL mapping
- Product tier and price-band validation
```

### API

```ts
export type CategoryLookup = { id: string } | { slug: string } | { name: string };

export type ProductLookup = { id: string } | { slug: string };

export async function createCategory(
	ctx: ServiceContext,
	input: CreateCategoryInput
): Promise<CategoryDTO>;
export async function getCategory(
	ctx: ServiceContext | null,
	lookup: CategoryLookup,
	options?: GetCategoryOptions
): Promise<CategoryDTO>;
export async function listCategories(
	ctx?: ServiceContext | null,
	options?: ListCategoriesOptions
): Promise<CategoryDTO[]>;
export async function updateCategory(
	ctx: ServiceContext,
	lookup: CategoryLookup,
	input: UpdateCategoryInput
): Promise<CategoryDTO>;
export async function deleteCategory(ctx: ServiceContext, lookup: CategoryLookup): Promise<void>;

export async function createProduct(
	ctx: ServiceContext,
	input: CreateProductInput
): Promise<ProductDTO>;
export async function getProduct(
	ctx: ServiceContext | null,
	lookup: ProductLookup,
	options?: GetProductOptions
): Promise<ProductDTO>;
export async function listProducts(
	ctx?: ServiceContext | null,
	options?: ListProductsOptions
): Promise<ProductListResult>;
export async function updateProduct(
	ctx: ServiceContext,
	lookup: ProductLookup,
	input: UpdateProductInput
): Promise<ProductDTO>;
export async function deleteProduct(ctx: ServiceContext, lookup: ProductLookup): Promise<void>;

export async function createProductVariant(
	ctx: ServiceContext,
	productId: string,
	input: CreateProductVariantInput
): Promise<ProductVariantDTO>;
export async function updateProductVariant(
	ctx: ServiceContext,
	variantId: string,
	input: UpdateProductVariantInput
): Promise<ProductVariantDTO>;
export async function deleteProductVariant(ctx: ServiceContext, variantId: string): Promise<void>;

export async function addProductImage(
	ctx: ServiceContext,
	input: AddProductImageInput
): Promise<ProductImageDTO>;
export async function setPrimaryProductImage(
	ctx: ServiceContext,
	imageId: string
): Promise<ProductImageDTO>;
export async function reorderProductImages(
	ctx: ServiceContext,
	productId: string,
	imageIdsInOrder: string[]
): Promise<ProductImageDTO[]>;
export async function deleteProductImage(ctx: ServiceContext, imageId: string): Promise<void>;

export async function createTag(ctx: ServiceContext, input: CreateTagInput): Promise<TagDTO>;
export async function listTags(): Promise<TagDTO[]>;
export async function setProductTags(
	ctx: ServiceContext,
	productId: string,
	tagIds: string[]
): Promise<void>;
```

### Required behavior

```txt
- Admin required for writes.
- Public reads return only active records. Options such as `includeInactive` require a `ServiceContext` actor with admin permission.
- Category/product image functions require ctx.event for R2 bucket access.
- Product image create/update/delete uses R2 compensation logic.
- Product DTOs include imageUrl derived from mediaUrl(r2Key).
- Variant price shown to UI is priceOverride ?? product.basePrice.
- Product creation with variants/images/tags is transactional for DB writes.
- R2 uploads happen outside DB transaction with compensation cleanup.
```

---

## 14.2 Inventory Module

Files:

```txt
src/lib/server/modules/inventory/inventory.service.ts
src/lib/server/modules/inventory/inventory.types.ts
```

### API

```ts
export async function getInventoryByVariant(variantId: string): Promise<InventoryDTO>;

export async function listLowStockVariants(options?: {
	limit?: number;
	offset?: number;
}): Promise<LowStockVariantDTO[]>;

export async function createInventoryForVariant(
	ctx: ServiceContext,
	input: CreateInventoryInput
): Promise<InventoryDTO>;

export async function restockVariant(
	ctx: ServiceContext,
	input: {
		variantId: string;
		quantity: number;
		note?: string;
	}
): Promise<InventoryDTO>;

export async function adjustInventory(
	ctx: ServiceContext,
	input: {
		variantId: string;
		quantityDelta: number;
		note: string;
	}
): Promise<InventoryDTO>;

export async function reserveInventory(input: {
	variantId: string;
	quantity: number;
	referenceId: string;
	now?: Date;
}): Promise<InventoryReservationResult>;

export async function releaseInventoryReservation(input: {
	variantId: string;
	quantity: number;
	referenceId: string;
	now?: Date;
}): Promise<InventoryDTO>;

export async function recordInventorySale(input: {
	variantId: string;
	quantity: number;
	referenceId: string;
	now?: Date;
}): Promise<InventoryDTO>;
```

### Internal transaction helpers

```ts
export async function reserveInventoryTx(
	tx: Tx,
	input: ReserveInventoryInput
): Promise<InventoryReservationResult>;
export async function releaseInventoryReservationTx(
	tx: Tx,
	input: ReleaseInventoryInput
): Promise<InventoryDTO>;
export async function recordInventorySaleTx(
	tx: Tx,
	input: RecordInventorySaleInput
): Promise<InventoryDTO>;
```

### Required behavior

```txt
- Inventory writes must always create an inventoryMovement row.
- Movement rows are append-only.
- available stock = quantity - reservedQuantity.
- Never increment reservedQuantity for backorder stock.
- If trackInventory is false, availability checks should not block sale.
- If allowBackorder is true and stock is insufficient, allow order without increasing reservedQuantity beyond quantity.
- Throw InventoryError with ErrorCode.INSUFFICIENT_STOCK when stock is insufficient and backorder is disabled.
```

---

## 14.3 Cart Module

Files:

```txt
src/lib/server/modules/cart/cart.service.ts
src/lib/server/modules/cart/cart.types.ts
```

### API

```ts
export async function getOrCreateCart(input: {
	userId?: string;
	sessionToken?: string;
	now?: Date;
}): Promise<CartDTO>;

export async function getCart(input: {
	userId?: string;
	sessionToken?: string;
}): Promise<CartDTO | null>;

export async function addItemToCart(input: {
	userId?: string;
	sessionToken?: string;
	variantId: string;
	quantity: number;
	now?: Date;
}): Promise<CartDTO>;

export async function updateCartItemQuantity(input: {
	cartItemId: string;
	quantity: number;
	userId?: string;
	sessionToken?: string;
	now?: Date;
}): Promise<CartDTO>;

export async function removeCartItem(input: {
	cartItemId: string;
	userId?: string;
	sessionToken?: string;
	now?: Date;
}): Promise<CartDTO>;

export async function clearCart(input: {
	userId?: string;
	sessionToken?: string;
	now?: Date;
}): Promise<void>;

export async function mergeGuestCartIntoUserCart(input: {
	sessionToken: string;
	userId: string;
	now?: Date;
}): Promise<CartDTO>;

export async function applyPromoCodeToCart(input: {
	userId?: string;
	sessionToken?: string;
	code: string;
	now?: Date;
}): Promise<CartDTO>;

export async function removePromoCodeFromCart(input: {
	userId?: string;
	sessionToken?: string;
}): Promise<CartDTO>;

export async function deleteExpiredGuestCarts(now: Date): Promise<CartDTO[]>;
```

### Required behavior

```txt
- Cart ownership must be exactly one of userId or sessionToken.
- Guest carts expire; authenticated carts persist.
- addItemToCart uses upsert on cartId + variantId.
- unitPrice is locked when item is added.
- Adding/increasing quantity reserves inventory.
- Decreasing/removing quantity releases inventory reservation.
- Merge guest cart into user cart after Better Auth anonymous account migration.
- Cart migration should be idempotent where possible.
```

---

## 14.4 Orders Module

Files:

```txt
src/lib/server/modules/orders/orders.service.ts
src/lib/server/modules/orders/orders.types.ts
```

### API

```ts
export type OrderLookup = { id: string } | { orderNumber: string };

export async function placeOrderFromCart(
	ctx: ServiceContext,
	input: {
		sessionToken?: string;
		shippingAddress: CheckoutAddressInput;
		shippingMethodId: string;
		paymentMethod: PaymentMethod;
		customerNote?: string;
	}
): Promise<OrderDTO>;

export async function getOrder(
	ctx: ServiceContext,
	lookup: OrderLookup,
	options?: {
		includeItems?: boolean;
		includePayments?: boolean;
		includeStatusHistory?: boolean;
	}
): Promise<OrderDTO>;

export async function listOrders(
	ctx: ServiceContext,
	options?: {
		status?: OrderStatus;
		userId?: string;
		limit?: number;
		offset?: number;
	}
): Promise<OrderListResult>;

export async function listMyOrders(
	ctx: ServiceContext,
	options?: {
		limit?: number;
		offset?: number;
	}
): Promise<OrderListResult>;

export async function transitionOrderStatus(
	ctx: ServiceContext,
	input: {
		orderId: string;
		toStatus: OrderStatus;
		note?: string;
	}
): Promise<OrderDTO>;

export async function cancelOrder(
	ctx: ServiceContext,
	input: {
		orderId: string;
		reason?: string;
	}
): Promise<OrderDTO>;

export async function recordPayment(input: {
	orderId: string;
	method: PaymentMethod;
	amount: number;
	transactionId?: string;
	gatewayResponse?: unknown;
	now?: Date;
}): Promise<PaymentDTO>;

export async function cancelExpiredPendingOrders(input: {
	actor: ServiceActor | SystemActor;
	now: Date;
	limit: number;
}): Promise<OrderDTO[]>;
```

### Required behavior

```txt
- placeOrderFromCart is transactional.
- Generate order number inside service.
- Validate cart is not empty.
- Snapshot shipping address, shipping method, promo code, product, variant, and primary image.
- Create order, order items, payment row, status history, promo usage, and inventory movement records in one DB transaction.
- Online payments may create pending orders with paymentExpiresAt.
- Offline payments such as COD/bank transfer can follow a separate confirmation flow.
- Enforce order status transitions.
- Write orderStatusHistory on every status transition.
- Only owners can view their orders unless actor is adminUser.
- Admin required for listOrders and status management.
```

---

## 14.5 Promotions Module

Files:

```txt
src/lib/server/modules/promotions/promotions.service.ts
src/lib/server/modules/promotions/promotions.forms.ts
src/lib/server/modules/promotions/promotions.types.ts
```

### API

```ts
export type PromoCodeLookup = { id: string } | { code: string };

export async function createPromoCode(
	ctx: ServiceContext,
	input: CreatePromoCodeInput
): Promise<PromoCodeDTO>;

export async function getPromoCode(
	ctx: ServiceContext,
	input: { lookup: PromoCodeLookup }
): Promise<PromoCodeDTO>;

export async function listPromoCodes(
	ctx: ServiceContext,
	options?: ListPromoCodesOptions
): Promise<PromoCodeListResult>;

export async function updatePromoCode(
	ctx: ServiceContext,
	input: { lookup: PromoCodeLookup; data: UpdatePromoCodeInput }
): Promise<PromoCodeDTO>;

export async function setPromoCodeActive(
	ctx: ServiceContext,
	input: SetPromoCodeActiveInput
): Promise<PromoCodeDTO>;

export async function validatePromoCodeForCart(
	input: ValidatePromoCodeForCartInput
): Promise<PromoValidationResult>;

export async function listPromoCodeUsages(
	ctx: ServiceContext,
	options?: ListPromoCodeUsagesOptions
): Promise<PromoCodeUsageListResult>;

export async function recordPromoUsage(
	ctx: ServiceContext,
	input: RecordPromoUsageInput
): Promise<PromoCodeUsageDTO>;

export async function reconcilePromoCodeUsageCount(
	ctx: ServiceContext,
	input: ReconcilePromoCodeUsageCountInput
): Promise<PromoCodeDTO>;

export async function reconcilePromoCodeUsageCounts(
	ctx: ServiceContext,
	input?: ReconcilePromoCodeUsageCountsInput
): Promise<PromoUsageReconciliationResult>;

export function createPromoCodeSnapshot(input: { promoCode: PromoCodeDTO }): PromoCodeSnapshot;
```

Internal transaction helpers are exported from `promotions.service.ts` for checkout/order services, but not from the module index:

```ts
export async function validatePromoCodeForCartTx(...): Promise<PromoValidationResult>;
export async function recordPromoUsageTx(...): Promise<PromoCodeUsageDTO>;
export async function reconcilePromoCodeUsageCountTx(...): Promise<PromoCodeDTO>;
```

### Required behavior

```txt
- Admin required for promo CRUD.
- New promo codes default inactive unless explicitly activated.
- Activation/deactivation is an explicit action through setPromoCodeActive.
- Admin route form schemas normalize promo codes by trimming and uppercasing before validation.
- Enforce active state, startsAt, expiresAt, usageLimit, perUserLimit, minOrderAmount, and maxDiscountAmount.
- usedCount + promoCodeUsage insert must happen in one transaction.
- promoCodeUsage.orderId has no FK; service must verify the order exists before recording usage.
- Scheduled reconciliation should reset usedCount from COUNT(promo_code_usage).
- Do not expose promoCodeUsage as generic CRUD; expose list, record, and reconciliation workflows only.
```

---

## 14.6 Drops Module

Files:

```txt
src/lib/server/modules/drops/drops.service.ts
src/lib/server/modules/drops/drops.forms.ts
src/lib/server/modules/drops/drops.types.ts
```

### API

Current implemented signatures:

```ts
export type DropLookup = { id: string; slug?: never } | { id?: never; slug: string };

export async function createDrop(ctx: ServiceContext, input: CreateDropInput): Promise<DropDTO>;
export async function getDrop(
	ctx: ServiceContext | null,
	lookup: DropLookup,
	options?: GetDropOptions
): Promise<DropDTO>;
export async function listDrops(
	ctx?: ServiceContext | null,
	options?: ListDropsOptions
): Promise<DropListResult>;

export async function updateDrop(
	ctx: ServiceContext,
	lookup: DropLookup,
	input: UpdateDropInput
): Promise<DropDTO>;

export async function deleteDrop(ctx: ServiceContext, lookup: DropLookup): Promise<void>;

export async function setDropProducts(
	ctx: ServiceContext,
	input: SetDropProductsInput
): Promise<DropDTO>;

export async function setDropHeroProduct(
	ctx: ServiceContext,
	input: SetDropHeroProductInput
): Promise<DropDTO>;

export async function transitionDropStatus(
	ctx: ServiceContext,
	input: TransitionDropStatusInput
): Promise<DropDTO>;

export async function transitionDueDropsToLive(
	ctx: ServiceContext,
	input: TransitionDueDropsToLiveInput
): Promise<DropLaunchBatchResult>;

export async function joinDropWaitlist(
	ctx: ServiceContext | null,
	input: JoinDropWaitlistInput
): Promise<DropWaitlistEntryDTO>;

export async function listDropWaitlistEntries(
	ctx: ServiceContext,
	input: ListDropWaitlistEntriesInput
): Promise<DropWaitlistEntryListResult>;

export async function listUnnotifiedDropWaitlistEntries(
	ctx: ServiceContext,
	input: ListUnnotifiedDropWaitlistEntriesInput
): Promise<DropWaitlistEntryDTO[]>;

export async function markDropWaitlistEntriesNotified(
	ctx: ServiceContext,
	input: MarkDropWaitlistEntriesNotifiedInput
): Promise<DropWaitlistMarkResult>;

export async function markDropWaitlistEntryNotified(
	ctx: ServiceContext,
	input: MarkDropWaitlistEntryNotifiedInput
): Promise<DropWaitlistMarkResult>;
```

### Required behavior

```txt
- Admin required for drop CRUD and transitions.
- Hero image upload uses R2 compensation.
- Only drop-tier products can be assigned to a live drop.
- A product can appear in one active/live drop at a time.
- One hero product per drop.
- Waitlist signup is idempotent.
- Waitlist notification is idempotent via notifiedAt.
- Cron launches due teaser drops. Waitlist delivery must use notification outbox producers before any email/SMS is sent.
```

---

## 14.7 Reviews Module

Files:

```txt
src/lib/server/modules/reviews/reviews.service.ts
src/lib/server/modules/reviews/reviews.forms.ts
src/lib/server/modules/reviews/reviews.types.ts
```

### API

```ts
export async function createReview(
	ctx: ServiceContext,
	input: CreateReviewInput
): Promise<ReviewDTO>;

export async function listProductReviews(
	ctx: ServiceContext | null,
	input: ListProductReviewsInput
): Promise<PublicReviewListResult>;

export async function getProductReviewSummary(
	ctx: ServiceContext | null,
	input: GetProductReviewSummaryInput
): Promise<ReviewSummaryDTO>;

export async function listRecentApprovedReviews(
	input?: ListRecentApprovedReviewsInput
): Promise<PublicReviewListResult>;

export async function getReview(
	ctx: ServiceContext | null,
	input: GetReviewInput
): Promise<ReviewDTO | PublicReviewDTO>;

export async function listMyReviews(
	ctx: ServiceContext,
	input?: ListMyReviewsInput
): Promise<ReviewListResult>;

export async function getReviewEligibility(
	ctx: ServiceContext,
	input: GetReviewEligibilityInput
): Promise<ReviewEligibilityDTO>;

export async function updateMyReview(
	ctx: ServiceContext,
	input: UpdateMyReviewInput
): Promise<ReviewDTO>;

export async function addReviewMedia(
	ctx: ServiceContext,
	input: AddReviewMediaInput
): Promise<ReviewDTO>;

export async function deleteReviewMedia(
	ctx: ServiceContext,
	input: DeleteReviewMediaInput
): Promise<ReviewDTO>;

export async function reorderReviewMedia(
	ctx: ServiceContext,
	input: ReorderReviewMediaInput
): Promise<ReviewDTO>;

export async function listReviews(
	ctx: ServiceContext,
	input?: ListReviewsInput
): Promise<ReviewListResult>;

export async function listPendingReviews(
	ctx: ServiceContext,
	input?: ListPendingReviewsInput
): Promise<ReviewListResult>;

export async function getReviewModerationSummary(
	ctx: ServiceContext,
	input?: GetReviewModerationSummaryInput
): Promise<ReviewModerationSummaryDTO>;

export async function moderateReview(
	ctx: ServiceContext,
	input: ModerateReviewInput
): Promise<ReviewDTO>;

export async function deleteReview(ctx: ServiceContext, input: DeleteReviewInput): Promise<void>;
```

### Required behavior

```txt
- Non-anonymous authenticated user required to create a review.
- One review per user per product.
- Verify purchase when orderId is provided.
- Reviews default to unapproved.
- Public/storefront reads return approved-only public DTOs by default.
- Admin required for unapproved reads, moderation queue, moderation summary, and moderation actions.
- Customer review edits and customer media changes reset approval.
- Review media supports images/videos through existing R2 media helpers.
- Review media upload/delete uses R2 compensation.
- `reviewMedia` is managed through media workflow APIs, not generic CRUD.
```

---

## 14.8 Shipping Module

Files:

```txt
src/lib/server/modules/shipping/shipping.service.ts
src/lib/server/modules/shipping/shipping.types.ts
```

### API

```ts
export function listShippingDistrictOptions(): ShippingDistrictOption[];

export async function listShippingQuotes(
	input?: ListShippingQuotesInput
): Promise<ShippingQuoteDTO[]>;

export async function calculateShippingQuote(
	input: CalculateShippingQuoteInput
): Promise<ShippingQuoteDTO>;

export async function createShippingMethod(
	ctx: ServiceContext,
	input: CreateShippingMethodInput
): Promise<ShippingMethodDTO>;

export async function updateShippingMethod(
	ctx: ServiceContext,
	input: UpdateShippingMethodInput & { shippingMethodId: string }
): Promise<ShippingMethodDTO>;

export async function getShippingMethod(
	ctx: ServiceContext,
	input: { shippingMethodId: string; includeZones?: boolean }
): Promise<ShippingMethodDTO>;

export async function listShippingMethods(
	ctx: ServiceContext,
	options?: ListShippingMethodsOptions
): Promise<ShippingMethodListResult>;

export async function setShippingZone(
	ctx: ServiceContext,
	input: SetShippingZoneInput
): Promise<ShippingZoneDTO>;

export async function removeShippingZone(
	ctx: ServiceContext,
	input: { shippingMethodId: string; district: SriLankaDistrict }
): Promise<void>;

export async function listShippingZones(
	ctx: ServiceContext,
	options?: ListShippingZonesOptions
): Promise<ShippingZoneListResult>;

export function createShippingMethodSnapshot(quote: ShippingQuoteDTO): ShippingMethodSnapshot;
```

Internal transaction helper available from `shipping.service.ts` for checkout/order workflows:

```ts
export async function calculateShippingQuoteTx(
	tx: QueryExecutor,
	input: CalculateShippingQuoteInput & { activeOnly?: boolean }
): Promise<ShippingQuoteDTO>;
```

### Required behavior

```txt
- Admin required for shipping method/zone writes.
- Public checkout reads only active methods; inactive/admin-only shipping reads require a `ServiceContext` actor with admin permission.
- District-level shippingZone overrides method defaults.
- Free-shipping threshold overrides price when subtotal qualifies.
- Return UI-ready ETA text and final price.
- Form schemas use refined insert/update schemas so delivery estimate range errors surface during route validation.
```

---

## 14.9 Addresses Module

Files:

```txt
src/lib/server/modules/addresses/addresses.service.ts
src/lib/server/modules/addresses/addresses.types.ts
```

### API

```ts
export async function createAddress(
	ctx: ServiceContext,
	input: CreateAddressInput
): Promise<AddressDTO>;

export async function listMyAddresses(ctx: ServiceContext): Promise<AddressDTO[]>;

export async function getAddress(ctx: ServiceContext, id: string): Promise<AddressDTO>;

export async function updateAddress(
	ctx: ServiceContext,
	id: string,
	input: UpdateAddressInput
): Promise<AddressDTO>;

export async function deleteAddress(ctx: ServiceContext, id: string): Promise<void>;

export async function setDefaultAddress(ctx: ServiceContext, id: string): Promise<AddressDTO>;

export function createAddressSnapshot(input: AddressSnapshotInput): AddressSnapshot;
```

### Required behavior

```txt
- Authenticated users can manage only their own saved addresses.
- Admin can inspect addresses only if needed for support/admin flows.
- Only authenticated users can have default addresses.
- setDefaultAddress unsets the previous default in the same transaction.
- Guest checkout addresses are not saved as default addresses.
- Order placement snapshots the address so historical orders do not change.
```

---

## 14.10 Wishlist Module

Files:

```txt
src/lib/server/modules/wishlist/wishlist.service.ts
src/lib/server/modules/wishlist/wishlist.types.ts
```

### API

```ts
export async function addToWishlist(
	ctx: ServiceContext,
	input: {
		productId: string;
		variantId?: string | null;
	}
): Promise<WishlistItemDTO>;

export async function removeFromWishlist(
	ctx: ServiceContext,
	input: {
		productId: string;
		variantId?: string | null;
	}
): Promise<void>;

export async function listWishlist(
	ctx: ServiceContext,
	options?: ListWishlistOptions
): Promise<WishlistListResult>;

export async function isWishlisted(
	ctx: ServiceContext,
	input: {
		productId: string;
		variantId?: string | null;
	}
): Promise<boolean>;

export async function getWishlistStatuses(
	ctx: ServiceContext,
	input: {
		targets: Array<{
			productId: string;
			variantId?: string | null;
		}>;
	}
): Promise<WishlistStatusDTO[]>;

export async function clearWishlist(ctx: ServiceContext): Promise<void>;

export async function listUserWishlist(
	ctx: ServiceContext,
	input: {
		userId: string;
		includeUnavailable?: boolean;
		limit?: number;
		offset?: number;
	}
): Promise<WishlistListResult>;

export async function listWishlistSignals(
	ctx: ServiceContext,
	options?: ListWishlistSignalsOptions
): Promise<WishlistSignalListResult>;
```

### Required behavior

```txt
- Non-anonymous authenticated user required.
- Add/remove should be idempotent.
- Customer add/status APIs validate active product, variant ownership, and active variant.
- Support product-only wishlist rows and product+variant wishlist rows.
- DTO should include product card data, selected variant data, imageUrl, and effective price.
- Admin gets read-only support/demand signal APIs, not generic wishlist mutation CRUD.
```

---

## 15. Cloudflare Queue and Cron Integration Contract

Cloudflare Queue consumers and scheduled handlers should call service functions and notification senders only. They must not import Drizzle tables, raw database clients, R2 primitives, or `$lib/client/*`.

Active orchestration modules:

```txt
src/lib/server/modules/queue                 # routes Cloudflare Queue batches by queue name
src/lib/server/modules/cron/scheduled-jobs.ts # routes Cloudflare Cron triggers by controller.cron
```

Expected orchestration surfaces:

```txt
Domain service transaction:
  - write business state
  - enqueue notification_outbox intent with unique idempotencyKey

After commit:
  - best-effort publish Queue message containing only outboxId/idempotencyKey

Cloudflare Queue consumer:
  - claim pending outbox row
  - call semantic sender
  - mark sent only after EmailResult.ok or SmsResult.ok
  - mark provider failures retryable/failed and ack the Queue message

Cloudflare Cron:
  - process due outbox rows
  - release stale processing locks
  - launch due drops through drops.service.ts
  - cancel expired pending orders through orders.service.ts
  - clean up expired guest carts through cart.service.ts
  - reconcile promo usage counts through promotions.service.ts
  - future: generate failure reports from DB outbox state
```

Current sender contracts that may be used by orchestration:

```ts
sendOrderConfirmationEmail(input);
sendShippingUpdateEmail(input);
sendDropLaunchEmail(input);
sendDropLaunchSms(input);
```

System actor convention:

```ts
const systemActor = {
	id: 'system:cron',
	role: 'adminUser'
} satisfies SystemActor;
```

Queue/Cron notification orchestration rules:

```txt
- DB notification_outbox is the source of truth.
- Queue messages carry only outboxId/idempotencyKey, never notification payloads or PII.
- Queue/job/cron code sends email/SMS.
- Domain services enqueue outbox intent or expose explicit list/mark helpers for legacy workflows.
- Only mark records sent/notified after successful delivery.
- Continue processing when one recipient fails.
- Use semantic notification senders such as `sendDropLaunchEmail` and `sendDropLaunchSms`.
- Treat DLQ as operational review, not durable business history.
```

Queue and Cron services must be:

```txt
- idempotent
- limit/batch aware
- safe to retry
- explicit about now
- not dependent on browser/client modules
- compatible with at-least-once Queue delivery
```

---

## 16. Index Export Convention

Each module should export a curated public API.

Example:

```ts
// src/lib/server/modules/products/index.ts

export * from './products.drizzle';
export * from './products.forms';
export * from './products.types';

export {
	createCategory,
	getCategory,
	listCategories,
	updateCategory,
	deleteCategory,
	createProduct,
	getProduct,
	listProducts,
	updateProduct,
	deleteProduct,
	createProductVariant,
	updateProductVariant,
	deleteProductVariant,
	addProductImage,
	setPrimaryProductImage,
	reorderProductImages,
	deleteProductImage,
	createTag,
	listTags,
	setProductTags
} from './products.service';
```

Avoid exporting internal `*Tx` helpers from module index files. Import them only within server module internals.

---

## 17. Implementation Order

### Phase 1: Foundation

Implement or confirm:

```txt
1. src/lib/shared/modules/access-control.ts
2. src/lib/server/modules/service-context.ts
3. src/lib/server/modules/auth/guards.ts
4. src/lib/server/modules/errors/route-adapter.ts
5. src/lib/server/modules/service-utils.ts
```

Foundation acceptance criteria:

```txt
- Server services can require admin/customer/owner.
- Route actions can convert AppError to action/form failures.
- Media services can receive ctx.event and resolve R2 bucket.
- Cron jobs can pass systemActor and explicit now.
```

### Phase 2: Products

Implement first because most modules depend on products.

```txt
products.forms.ts
products.types.ts
products.service.ts
products/index.ts
```

Start with:

```txt
- Category CRUD with image upload
- Product CRUD
- Variant CRUD
- Product images
- Tags and product tags
```

### Phase 3: Inventory

Implement:

```txt
inventory.types.ts
inventory.service.ts
```

Start with:

```txt
- getInventoryByVariant
- restockVariant
- adjustInventory
- reserveInventory
- releaseInventoryReservation
- recordInventorySale
- Tx helper variants
```

### Phase 4: Cart

Implement:

```txt
cart.types.ts
cart.service.ts
```

Start with:

```txt
- getOrCreateCart
- addItemToCart
- updateCartItemQuantity
- removeCartItem
- mergeGuestCartIntoUserCart
- deleteExpiredGuestCarts
```

### Phase 5: Orders

Implement:

```txt
orders.types.ts
orders.service.ts
```

Start with:

```txt
- placeOrderFromCart
- getOrder
- listMyOrders
- listOrders
- transitionOrderStatus
- cancelOrder
- cancelExpiredPendingOrders
```

### Phase 6: Checkout dependencies

Implement:

```txt
addresses.service.ts
shipping.service.ts
promotions.service.ts
```

### Phase 7: Community/marketing modules

Implement:

```txt
wishlist.service.ts
reviews.service.ts
drops.service.ts
```

### Phase 8: Route cleanup

Refactor all route files:

```txt
- Remove direct db imports.
- Remove direct table imports.
- Remove direct query-builder imports.
- Import service functions.
- Import form schemas.
- Convert service AppErrors through route-adapter helpers.
```

### Phase 9: Cloudflare Queue and cron activation

Queue/Cron notification handler wiring is active. Re-check this section before extending notification transport beyond the current outbox-backed email/SMS workflows.

Before relying on the custom Vite plugin permanently, re-check the installed `@sveltejs/adapter-cloudflare` version and its official release notes. If the adapter gains native support for merging custom Worker handlers, remove the workaround instead of carrying duplicate scheduled-handler wiring.

```txt
- Keep DB notification outbox schema/service and idempotent claim/mark APIs as the source of truth.
- Keep Cloudflare Queue producer/consumer bindings and typed environment entries aligned with `wrangler.jsonc`.
- Keep Queue and scheduled entrypoints wired through `hooks.server.ts` and the custom Vite append plugin.
- Ensure the append plugin remains in vite.config.ts until native adapter support replaces it.
- Test each cron branch independently.
- Test Queue duplicate delivery and DLQ behavior.
```

---

## 18. Testing Plan

### Service unit/integration tests

Prioritize:

```txt
1. Product/category image upload compensation
2. Product image primary uniqueness
3. Product tier price-band validation
4. Inventory reservation and movement creation
5. Backorder behavior
6. Cart upsert behavior
7. Cart reservation release
8. Guest cart merge
9. Order placement snapshots
10. Order status transitions and history
11. Promo usage limits and usedCount reconciliation
12. Shipping zone quote calculation
13. Address default transaction
14. Wishlist idempotency
15. Review verified purchase and moderation
16. Drop live transition and waitlist idempotency
```

### Route tests

Check:

```txt
- Invalid forms return superforms errors.
- Domain errors map to useful messages.
- Unauthorized users cannot perform admin writes.
- Routes do not import db/tables directly.
```

### Queue and cron tests

Check:

```txt
- Jobs are idempotent.
- Jobs respect batch limits.
- Unknown cron values are ignored safely.
- Queue duplicate delivery does not send duplicate notifications when the outbox row is already sent.
- Queue messages contain only outboxId/idempotencyKey, not payloads or PII.
- Provider failure marks outbox state retryable/failed without marking sent.
- Successful notification marks only successfully delivered outbox rows.
- Cron recovers pending, due failed, and stale locked outbox rows.
- DLQ handling does not replace DB outbox audit state.
- Email/SMS sender failures return typed result objects and do not stop the whole batch.
```

---

## 19. LLM Agent Instructions

When implementing this architecture, LLM agents must follow these rules:

```txt
0. Read docs/codex-service-layer-workflow.md before planning service APIs.
1. Do not put business logic in +page.server.ts.
2. Do not import db or Drizzle tables in routes.
3. Do not create generic CRUD for audit/junction tables.
4. Use existing ErrorCode and domain error classes.
5. Use server auth guards for permissions.
6. Use role names adminUser and customerUser.
7. Use ctx.event for R2 upload services.
8. Use mediaUrl for DTO public URLs.
9. Use deleteObjectSafe for R2 cleanup.
10. Use transaction-aware internal Tx helpers for cross-module workflows.
11. Keep raw Drizzle schemas and form schemas separate.
12. Return DTOs from services, not raw DB rows when the UI needs derived fields.
13. Queue and cron functions must be idempotent and retry-safe.
14. Never import client modules into server services unless the file is explicitly shared under src/lib/shared.
15. Notification modules must use server-safe env access through `$lib/server/modules/env` or another approved shared/server helper.
16. Do not put email/SMS delivery orchestration inside domain services; write notification_outbox intent and let Queue/Cron orchestration send.
17. Do not mark notification records as sent unless the corresponding email/SMS send succeeded.
18. Keep Queue messages limited to outboxId/idempotencyKey; never put notification payloads or PII in Queue messages.
19. Treat Cloudflare DLQ as operational review only; audit/retry state stays in the DB outbox.
20. Prefer semantic notification senders such as `sendDropLaunchEmail` and `sendDropLaunchSms` for drop launch waitlist entries.
21. Produce an API plan from storefront, admin dashboard, checkout/account, Queue/Cron/job, support, and notification needs before coding a new service.
```

---

## 20. Validation Checklist

Before considering the architecture complete, verify:

```txt
- Every module with a *.drizzle.ts file has a *.service.ts file or a documented reason not to.
- Every route action uses service functions for writes.
- Every multi-table write runs inside a transaction.
- Every inventory write creates an inventoryMovement row.
- Every order status change creates an orderStatusHistory row.
- Promo usage writes update usedCount and promoCodeUsage atomically.
- Media upload services use R2 compensation cleanup.
- DTOs convert R2 keys to /media URLs.
- Server services enforce permissions with auth guards.
- Client UI access checks are treated as convenience only.
- Queue consumers and cron jobs call service functions and semantic notification senders only.
- Notification outbox state is durable in the database and guarded by unique idempotency keys.
- Queue payloads contain only outbox identifiers, not notification payloads or PII.
- DLQ handling is operational and does not replace DB retry/audit state.
- Notification modules do not import from `$lib/client/*`.
- Email/SMS senders return typed result objects for ordinary delivery failures.
- Waitlist notification marking is idempotent and only follows successful delivery.
- AppErrors are mapped consistently in route actions.
- Raw unexpected errors are not swallowed.
```

---

## 21. Final Architecture Statement

For each business module with a `*.drizzle.ts` file, add a matching `*.service.ts` file that owns business workflows, authorization, transactions, media side effects, domain errors, and DTO mapping. Keep Drizzle schema files focused on database definitions and base validation. Keep route files thin: routes load data, create forms, call services, and convert service errors into user-facing responses.

Use the existing project foundations:

```txt
src/lib/shared/modules/access-control.ts
src/lib/server/modules/errors/index.ts
src/lib/server/modules/media/r2.ts
src/lib/server/modules/media/utils.ts
src/lib/server/modules/notifications/outbox
src/lib/server/modules/notifications/email
src/lib/server/modules/notifications/sms
```

Services should be business-oriented, not CRUD-only wrappers. They should expose efficient APIs such as `getCategory({ id | slug | name })`, `placeOrderFromCart`, `reserveInventory`, `mergeGuestCartIntoUserCart`, `transitionOrderStatus`, and `calculateShippingQuote`.

This architecture gives collaborators and LLM agents a stable rule:

```txt
Schemas define data.
Forms define user input.
Services define business behavior.
Routes coordinate requests.
Components render UI.
```
