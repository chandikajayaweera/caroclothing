# CaroClothing Service Layer Architecture Plan

**Audience:** project collaborators and LLM coding agents  
**Status:** validated development-ready architecture plan — updated with notification/email/SMS rules on 2026-05-02  
**Scope:** server module services, route boundaries, forms, access control, errors, R2 media, cron workflows, and module-by-module implementation order

## Validation Notes From Final Review

This version includes the final validation pass. The main corrections applied are:

1. Privileged read APIs now accept an optional `ServiceContext` when options can expose inactive, archived, unpublished, or admin-only data. Public reads must default to public-safe results.
2. New server services and cron services must not import from `$lib/client/*`. If a server-side workflow needs public app configuration such as `PUBLIC_APP_URL`, extract that helper into a server-safe or shared module.
3. The Cloudflare scheduled-handler workaround should remain project-specific and should be revalidated whenever `@sveltejs/adapter-cloudflare` is upgraded.
4. R2 cleanup should rely on the project `deleteObjectSafe` wrapper, not direct bucket deletion from feature services.
5. Notification workflows now have a dedicated contract: domain services expose idempotent list/mark helpers, while cron/job orchestration sends email/SMS and marks records notified only after successful delivery.

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
6. Cron scaffolding already expects service-layer functions such as cart cleanup, drop launch, order expiry cancellation, promo reconciliation, and waitlist notification.
7. Notification modules expose typed email/SMS send primitives and semantic senders such as drop launch email/SMS wrappers.

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
db
getDb
eq
and
sql
category
product
cart
order
inventory
uploadImage
buildMediaKey
```

Routes should import service functions and form schemas only.

Allowed route imports:

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
| `dropProduct`        |           No | `assignProductsToDrop`, `setDropHeroProduct`                                    |
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

Add a route adapter file:

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
await createCategory({
	actor: locals.user,
	event
}, input);
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

## 8.4 Notification Services: Email and SMS

The project has dedicated server-side notification modules:

```txt
src/lib/server/modules/notifications/email
src/lib/server/modules/notifications/sms
```

These modules are infrastructure helpers used by auth, transactional order flows, shipping updates, marketing communications, drop launch notifications, and cron jobs.

### 8.4.1 Notification boundary rules

Business services should not become notification orchestrators unless the notification is part of that service's explicit business transaction contract.

Preferred split:

```txt
Business service:
  - validates domain rules
  - writes database state
  - exposes list/mark helpers for notification workflows
  - keeps notification state idempotent

Cron/job/orchestration layer:
  - calls service list helpers
  - sends email/SMS through notification modules
  - marks records notified only after successful send
```

Example for drop waitlist notifications:

```txt
drops.service.ts:
  - transitionDueDropsToLive
  - listUnnotifiedDropWaitlistEntries
  - markDropWaitlistEntriesNotified

cron/scheduled-jobs.ts:
  - call transitionDueDropsToLive
  - call listUnnotifiedDropWaitlistEntries
  - call sendDropLaunchEmail or sendDropLaunchSms
  - mark entries notified only after successful send
```

Do not put actual email/SMS sending inside `drops.service.ts`. Drops service should own drop state and notification state; cron/job code should own delivery orchestration.

### 8.4.2 Email module contract

The email module should export its public API through:

```txt
src/lib/server/modules/notifications/email/index.ts
```

Core contract:

```ts
export type EmailResult =
	| { ok: true; id: string }
	| { ok: false; error: string };
```

Normal email delivery failures should return `EmailResult` instead of throwing. This allows batch jobs to continue processing and prevents failed delivery attempts from being marked as notified.

Acceptable exception:

```txt
Auth-specific OTP email helpers may throw if they are integrated with auth flows that expect thrown failures.
```

Semantic senders should be preferred over generic template calls inside cron/job code. Examples:

```ts
sendOrderConfirmationEmail(...)
sendShippingUpdateEmail(...)
sendDropLaunchEmail(...)
```

Drop launch email support should expose both the sender and its input type:

```ts
export type DropLaunchEmailInput = {
	to: string | string[];
	dropName: string;
	dropSlug?: string;
	dropUrl: string;
	tagline?: string | null;
	heroImageUrl?: string;
};

export async function sendDropLaunchEmail(
	input: DropLaunchEmailInput
): Promise<EmailResult>;
```

`sendDropLaunchEmail` may internally reuse the promotional email template, but cron code should call the semantic drop sender.

### 8.4.3 SMS module contract

The SMS module should export its public API through:

```txt
src/lib/server/modules/notifications/sms/index.ts
```

Core contract:

```ts
export type SmsResult =
	| { ok: true; messageId: string }
	| { ok: false; error: string };
```

Normal SMS delivery failures should return `SmsResult` instead of throwing.

Semantic SMS senders should be added as workflows need them. For drop launch notifications, prefer:

```ts
export type DropLaunchSmsInput = {
	to: string;
	dropName: string;
	dropUrl: string;
};

export async function sendDropLaunchSms(
	input: DropLaunchSmsInput
): Promise<SmsResult>;
```

### 8.4.4 Server environment rule

Notification modules are server modules. They must not import from:

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

### 8.4.5 Cron notification safety rules

Cron notification workflows must be:

```txt
- idempotent
- batch-limited
- safe to retry
- explicit about now
- independent per recipient
- not dependent on browser/client modules
```

A failed email/SMS send must not mark the target record as notified.

A successful email/SMS send may mark the record as notified using a service helper such as:

```ts
markDropWaitlistEntriesNotified(ctx, {
	entryIds,
	notifiedAt: now
});
```

The marking helper must be idempotent:

```txt
- handle empty entryIds safely
- update only rows where notifiedAt IS NULL
- return markedCount
- avoid failing merely because already-notified entries are included, unless strict mode is explicitly requested
```

### 8.4.6 Progressive notification updates

Notification modules can be improved progressively as service modules need them.

Do not block service-layer development on a complete notification redesign. Instead:

```txt
1. Keep core send primitives typed.
2. Add semantic senders as modules need them.
3. Keep senders returning typed results for ordinary delivery failures.
4. Keep domain state changes in services.
5. Keep delivery orchestration in cron/jobs/webhooks.
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

export const createCategoryFormSchema = insertCategorySchema
	.omit({ imageR2Key: true })
	.extend({
		image: imageFileSchema.optional()
	});

export const updateCategoryFormSchema = updateCategorySchema
	.omit({ imageR2Key: true })
	.extend({
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
createCategory
getCategory
listCategories
updateCategory
deleteCategory
```

Avoid PascalCase service functions:

```ts
CreateCategory
GetCategory
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
export type CategoryLookup =
	| { id: string }
	| { slug: string }
	| { name: string };

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
		categories: await listCategories(
			{ actor: event.locals.user },
			{ includeInactive: true }
		),
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
export type CategoryLookup =
	| { id: string }
	| { slug: string }
	| { name: string };

export type ProductLookup =
	| { id: string }
	| { slug: string };

export async function createCategory(ctx: ServiceContext, input: CreateCategoryInput): Promise<CategoryDTO>;
export async function getCategory(ctx: ServiceContext | null, lookup: CategoryLookup, options?: GetCategoryOptions): Promise<CategoryDTO>;
export async function listCategories(ctx?: ServiceContext | null, options?: ListCategoriesOptions): Promise<CategoryDTO[]>;
export async function updateCategory(ctx: ServiceContext, lookup: CategoryLookup, input: UpdateCategoryInput): Promise<CategoryDTO>;
export async function deleteCategory(ctx: ServiceContext, lookup: CategoryLookup): Promise<void>;

export async function createProduct(ctx: ServiceContext, input: CreateProductInput): Promise<ProductDTO>;
export async function getProduct(ctx: ServiceContext | null, lookup: ProductLookup, options?: GetProductOptions): Promise<ProductDTO>;
export async function listProducts(ctx?: ServiceContext | null, options?: ListProductsOptions): Promise<ProductListResult>;
export async function updateProduct(ctx: ServiceContext, lookup: ProductLookup, input: UpdateProductInput): Promise<ProductDTO>;
export async function deleteProduct(ctx: ServiceContext, lookup: ProductLookup): Promise<void>;

export async function createProductVariant(ctx: ServiceContext, productId: string, input: CreateProductVariantInput): Promise<ProductVariantDTO>;
export async function updateProductVariant(ctx: ServiceContext, variantId: string, input: UpdateProductVariantInput): Promise<ProductVariantDTO>;
export async function deleteProductVariant(ctx: ServiceContext, variantId: string): Promise<void>;

export async function addProductImage(ctx: ServiceContext, input: AddProductImageInput): Promise<ProductImageDTO>;
export async function setPrimaryProductImage(ctx: ServiceContext, imageId: string): Promise<ProductImageDTO>;
export async function reorderProductImages(ctx: ServiceContext, productId: string, imageIdsInOrder: string[]): Promise<ProductImageDTO[]>;
export async function deleteProductImage(ctx: ServiceContext, imageId: string): Promise<void>;

export async function createTag(ctx: ServiceContext, input: CreateTagInput): Promise<TagDTO>;
export async function listTags(): Promise<TagDTO[]>;
export async function setProductTags(ctx: ServiceContext, productId: string, tagIds: string[]): Promise<void>;
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

export async function reserveInventory(
	input: {
		variantId: string;
		quantity: number;
		referenceId: string;
		now?: Date;
	}
): Promise<InventoryReservationResult>;

export async function releaseInventoryReservation(
	input: {
		variantId: string;
		quantity: number;
		referenceId: string;
		now?: Date;
	}
): Promise<InventoryDTO>;

export async function recordInventorySale(
	input: {
		variantId: string;
		quantity: number;
		referenceId: string;
		now?: Date;
	}
): Promise<InventoryDTO>;
```

### Internal transaction helpers

```ts
export async function reserveInventoryTx(tx: Tx, input: ReserveInventoryInput): Promise<InventoryReservationResult>;
export async function releaseInventoryReservationTx(tx: Tx, input: ReleaseInventoryInput): Promise<InventoryDTO>;
export async function recordInventorySaleTx(tx: Tx, input: RecordInventorySaleInput): Promise<InventoryDTO>;
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
export type OrderLookup =
	| { id: string }
	| { orderNumber: string };

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

export async function recordPayment(
	input: {
		orderId: string;
		method: PaymentMethod;
		amount: number;
		transactionId?: string;
		gatewayResponse?: unknown;
		now?: Date;
	}
): Promise<PaymentDTO>;

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
src/lib/server/modules/promotions/promotions.types.ts
```

### API

```ts
export type PromoCodeLookup =
	| { id: string }
	| { code: string };

export async function createPromoCode(ctx: ServiceContext, input: CreatePromoCodeInput): Promise<PromoCodeDTO>;
export async function getPromoCode(ctx: ServiceContext, lookup: PromoCodeLookup): Promise<PromoCodeDTO>;

export async function listPromoCodes(ctx: ServiceContext, options?: {
	includeInactive?: boolean;
	limit?: number;
	offset?: number;
}): Promise<PromoCodeDTO[]>;

export async function updatePromoCode(
	ctx: ServiceContext,
	lookup: PromoCodeLookup,
	input: UpdatePromoCodeInput
): Promise<PromoCodeDTO>;

export async function validatePromoCodeForCart(input: {
	code: string;
	userId?: string | null;
	subtotal: number;
	now?: Date;
}): Promise<PromoValidationResult>;

export async function recordPromoUsage(input: {
	promoCodeId: string;
	orderId: string;
	userId?: string | null;
	discountAmount: number;
	now?: Date;
}): Promise<void>;

export async function reconcilePromoCodeUsageCount(
	promoCodeId: string,
	ctx: ServiceContext
): Promise<PromoCodeDTO>;
```

### Required behavior

```txt
- Admin required for promo CRUD.
- New promo codes default inactive unless explicitly activated.
- Enforce active state, startsAt, expiresAt, usageLimit, perUserLimit, minOrderAmount, and maxDiscountAmount.
- usedCount + promoCodeUsage insert must happen in one transaction.
- promoCodeUsage.orderId has no FK; service must verify the order exists before recording usage.
- Scheduled reconciliation should reset usedCount from COUNT(promo_code_usage).
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

```ts
export type DropLookup =
	| { id: string }
	| { slug: string };

export async function createDrop(ctx: ServiceContext, input: CreateDropInput): Promise<DropDTO>;
export async function getDrop(ctx: ServiceContext | null, lookup: DropLookup, options?: GetDropOptions): Promise<DropDTO>;
export async function listDrops(ctx?: ServiceContext | null, options?: ListDropsOptions): Promise<DropDTO[]>;

export async function updateDrop(
	ctx: ServiceContext,
	lookup: DropLookup,
	input: UpdateDropInput
): Promise<DropDTO>;

export async function assignProductsToDrop(
	ctx: ServiceContext,
	input: {
		dropId: string;
		productIds: string[];
	}
): Promise<void>;

export async function setDropHeroProduct(
	ctx: ServiceContext,
	input: {
		dropId: string;
		productId: string;
	}
): Promise<void>;

export async function transitionDropStatus(
	ctx: ServiceContext,
	input: {
		dropId: string;
		toStatus: DropStatus;
		now?: Date;
	}
): Promise<DropDTO>;

export async function transitionDueDropsToLive(input: {
	actor: ServiceActor | SystemActor;
	now: Date;
	limit?: number;
}): Promise<DropDTO[]>;

export async function joinDropWaitlist(input: {
	dropId: string;
	contact: string;
	contactType: 'phone' | 'email';
	userId?: string | null;
	now?: Date;
}): Promise<void>;

export async function listUnnotifiedDropWaitlistEntries(
	dropId: string,
	options: {
		actor: ServiceActor | SystemActor;
		limit: number;
	}
): Promise<DropWaitlistEntryDTO[]>;

export async function markDropWaitlistEntryNotified(
	entryId: string,
	ctx: ServiceContext
): Promise<void>;
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
- Cron launches due teaser drops and notifies waitlist batches.
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

export async function getProductReviews(
	productId: string,
	options?: {
		approvedOnly?: boolean;
		limit?: number;
		offset?: number;
	}
): Promise<ReviewDTO[]>;

export async function listPendingReviews(
	ctx: ServiceContext,
	options?: {
		limit?: number;
		offset?: number;
	}
): Promise<ReviewDTO[]>;

export async function moderateReview(
	ctx: ServiceContext,
	input: {
		reviewId: string;
		isApproved: boolean;
		adminNote?: string;
	}
): Promise<ReviewDTO>;

export async function addReviewMedia(
	ctx: ServiceContext,
	input: {
		reviewId: string;
		files: File[];
	}
): Promise<ReviewDTO>;

export async function deleteReview(
	ctx: ServiceContext,
	reviewId: string
): Promise<void>;
```

### Required behavior

```txt
- Non-anonymous authenticated user required to create a review.
- One review per user per product.
- Verify purchase when orderId is provided.
- Reviews default to unapproved.
- Admin required for moderation queue and moderation actions.
- Review media supports images/videos through existing R2 media helpers.
- Review media upload/delete uses R2 compensation.
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
export async function createShippingMethod(
	ctx: ServiceContext,
	input: CreateShippingMethodInput
): Promise<ShippingMethodDTO>;

export async function updateShippingMethod(
	ctx: ServiceContext,
	id: string,
	input: UpdateShippingMethodInput
): Promise<ShippingMethodDTO>;

export async function listShippingMethods(options?: {
	activeOnly?: boolean;
	district?: SriLankaDistrict;
	subtotal?: number;
}): Promise<ShippingMethodQuoteDTO[]>;

export async function setShippingZone(
	ctx: ServiceContext,
	input: {
		shippingMethodId: string;
		district: SriLankaDistrict;
		priceOverride: number;
		estimatedDaysMin: number;
		estimatedDaysMax: number;
	}
): Promise<ShippingZoneDTO>;

export async function calculateShippingQuote(input: {
	shippingMethodId: string;
	district: SriLankaDistrict;
	subtotal: number;
}): Promise<ShippingQuoteDTO>;
```

### Required behavior

```txt
- Admin required for shipping method/zone writes.
- Public checkout reads only active methods; inactive/admin-only shipping reads require a `ServiceContext` actor with admin permission.
- District-level shippingZone overrides method defaults.
- Free-shipping threshold overrides price when subtotal qualifies.
- Return UI-ready ETA text and final price.
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

export async function getAddress(
	ctx: ServiceContext,
	id: string
): Promise<AddressDTO>;

export async function updateAddress(
	ctx: ServiceContext,
	id: string,
	input: UpdateAddressInput
): Promise<AddressDTO>;

export async function deleteAddress(
	ctx: ServiceContext,
	id: string
): Promise<void>;

export async function setDefaultAddress(
	ctx: ServiceContext,
	id: string
): Promise<AddressDTO>;

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
	ctx: ServiceContext
): Promise<WishlistItemDTO[]>;

export async function isWishlisted(
	ctx: ServiceContext,
	input: {
		productId: string;
		variantId?: string | null;
	}
): Promise<boolean>;
```

### Required behavior

```txt
- Non-anonymous authenticated user required.
- Add/remove should be idempotent.
- Support product-only wishlist rows and product+variant wishlist rows.
- DTO should include product card data, selected variant data, imageUrl, and effective price.
```

---

## 15. Cron Integration Contract

`src/lib/server/modules/cron/scheduled-jobs.ts` should call service functions only.

Expected service functions:

```ts
deleteExpiredGuestCarts(now: Date)

cancelExpiredPendingOrders({
	actor: systemActor,
	now,
	limit: 50
})

transitionDueDropsToLive({
	actor: systemActor,
	now
})

listDrops(
	{ actor: systemActor },
	{
		status: 'live',
		sortBy: 'launchAt',
		limit: 100
	}
)

listUnnotifiedDropWaitlistEntries(drop.id, {
	actor: systemActor,
	limit: WAITLIST_BATCH_SIZE
})

sendDropLaunchEmail({
	to: entry.contact,
	dropName: drop.name,
	dropSlug: drop.slug,
	dropUrl,
	tagline: drop.tagline,
	heroImageUrl
})

sendDropLaunchSms({
	to: entry.contact,
	dropName: drop.name,
	dropUrl
})

markDropWaitlistEntriesNotified(
	{ actor: systemActor, now },
	{ entryIds: successfullySentEntryIds }
)

listPromoCodes({
	actor: systemActor,
	includeInactive: true,
	limit,
	offset
})

reconcilePromoCodeUsageCount(code.id, {
	actor: systemActor
})
```

System actor convention:

```ts
const systemActor = {
	id: 'system:cron',
	role: 'adminUser'
} satisfies SystemActor;
```

Cron notification orchestration rules:

```txt
- Cron/job code sends email/SMS.
- Domain services expose list/mark helpers.
- Only mark records notified after successful delivery.
- Continue processing when one recipient fails.
- Use semantic notification senders such as sendDropLaunchEmail and sendDropLaunchSms.
```

Cron services must be:

```txt
- idempotent
- limit/batch aware
- safe to retry
- explicit about now
- not dependent on browser/client modules
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

### Phase 9: Cron activation

Enable scheduled handler wiring only after services exist and are idempotent.

Before relying on the custom Vite plugin permanently, re-check the installed `@sveltejs/adapter-cloudflare` version and its official release notes. If the adapter gains native support for merging custom Worker handlers, remove the workaround instead of carrying duplicate scheduled-handler wiring.

```txt
- Uncomment scheduled entry in hooks.server.ts.
- Ensure cloudflare-append-scheduled plugin remains in vite.config.ts.
- Test each cron branch independently.
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

### Cron tests

Check:

```txt
- Jobs are idempotent.
- Jobs respect batch limits.
- Unknown cron values are ignored safely.
- Failed notification does not mark waitlist entry notified.
- Successful notification marks only the successfully delivered entries.
- Email/SMS sender failures return typed result objects and do not stop the whole batch.
```

---

## 19. LLM Agent Instructions

When implementing this architecture, LLM agents must follow these rules:

```txt
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
13. Cron functions must be idempotent and retry-safe.
14. Never import client modules into server services unless the file is explicitly shared under src/lib/shared.
15. Notification modules must use server-safe env access through `$lib/server/modules/env` or another approved shared/server helper.
16. Do not put email/SMS delivery orchestration inside domain services such as `drops.service.ts`; expose list/mark helpers and let cron/jobs send.
17. Do not mark notification records as notified unless the corresponding email/SMS send succeeded.
18. Prefer semantic notification senders such as `sendDropLaunchEmail` and `sendDropLaunchSms` over rebuilding message copy in cron code.
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
- Cron jobs call service functions and semantic notification senders only.
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
