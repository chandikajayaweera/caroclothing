# Codex Service-Layer Workflow

- **Audience:** Codex agents and humans using Codex in CaroClothing
- **Status:** current as of 2026-05-19
- **Scope:** prompts, repo guidance, skills, custom agents, planning, implementation, review, and validation for service-layer work

## Source Of Truth

Use the codebase as source of truth before planning. Required project guidance lives in:

```txt
AGENTS.md
docs/service-layer-architecture.md
docs/codex-service-layer-workflow.md
.gemini/skills
.gemini/agents
```

Do not migrate project Codex files to `.agents/skills` unless the user explicitly requests a discovery-path migration.

Current services:

```txt
auth
addresses
products
drops
wishlist
bag
shipping
promotions
inventory
orders
reviews
```

`inventory` exposes curated admin inventory APIs through its module index. Internal `*Tx` helpers in `inventory.service.ts` continue to support bag/order-style transaction workflows and should be imported directly only by server internals that are already inside a transaction.

Bag stock rule: bag writes never reserve inventory. `startCheckout` owns the 10-minute reservation transaction. When shoppers contend for the last stock, one reservation wins; later shoppers see the active hold countdown instead of out-of-stock when those held units could satisfy their quantity. Bag items and the selected product-detail variant refresh continuously so new holds appear, abandoned holds become available, and completed purchases become out of stock. Bag mutations or checkout exit cancel active holds; expiry releases stock while preserving bag items.

Account rule: phone registration must not persist the phone number as the display name. Phone-created accounts require name completion, and account deletion must release checkout inventory, remove profile-owned waitlist state, cancel unsent notifications, preserve anonymized order history, and clean review media through the owning services.

Current server layers:

```txt
Domain:
  src/lib/server/modules/* with business schema/service/types
  src/lib/server/modules/notifications/outbox for durable notification state

Infrastructure:
  src/lib/server/infrastructure/env
  src/lib/server/infrastructure/errors
  src/lib/server/infrastructure/media
  src/lib/server/infrastructure/email
  src/lib/server/infrastructure/sms

Foundation:
  src/lib/server/foundation/context.ts
  src/lib/server/foundation/guards.ts
  src/lib/server/foundation/utils.ts
  src/lib/shared/modules/access-control.ts

Orchestration:
  src/lib/server/infrastructure/queue
  src/lib/server/infrastructure/cron
  src/lib/server/infrastructure/notifications/outbox.dispatcher.ts
```

Ignore `docs/caro_brand_identity.html` and `docs/caro_marketing_strategy.html` unless the user explicitly asks for product, brand, marketing, or storefront strategy.

## Workflow

1. Orient
   - Use `$caro-service-layer` for service work.
   - Read `docs/service-layer-architecture.md`, this guide, target `*.drizzle.ts`, current service/type/form files, relevant routes, and helper modules.
   - Output files inspected, layer classification, schema invariants, cross-module dependencies, access-control needs, media needs, notification needs, and validation commands.

2. Curate service APIs
   - Use `$caro-service-api-planner` before new service implementation.
   - Plan from storefront, admin dashboard, checkout/account, Queue/Cron/jobs, support, notification, and related-module needs.
   - Prefer business workflow APIs over table wrappers.
   - Do not expose generic CRUD for internal/audit/junction tables.
   - Separate public-safe reads from privileged reads.
   - Mark missing helpers as prerequisites instead of importing guessed paths.

3. Design implementation
   - Use `$caro-service-layer` after the API plan is accepted.
   - Decide transaction boundaries, internal Tx helper use, DTO mapping, validation source, authorization checks, R2 compensation, notification outbox behavior, and test commands before coding.

4. Build
   - Keep edits scoped to the module and necessary foundations.
   - Use canonical import paths only.
   - Use existing `AppError`, `ErrorCode`, domain errors, server guards, `getEnv()`, media helpers, and route adapters.
   - Do not import `$lib/client/*` inside server modules.
   - Do not send email/SMS inside domain services unless explicitly approved.

5. Integrate routes
   - Use `$caro-route-refactor`.
   - Use `$caro-svelte-route-builder` when creating new service-backed SvelteKit route files and bare Superforms page skeletons.
   - Routes import service functions, form schemas, and route error adapters only.
   - Business routes must not import db, Drizzle tables, Drizzle query helpers, or R2 primitives.
   - `src/routes/media/[...key]/+server.ts` is the media R2 exception.
   - For forms with `File` or `File[]`, use Superforms file handling, return files with validation/service errors, pass `ctx.event` to services, and keep R2 work inside services.
   - Initialize create forms with `errors: false` when required defaults are intentionally blank so first render does not show validation errors.
   - Use Svelte MCP or Context7 before changing uncertain SvelteKit/Superforms APIs.

6. Design route UI
   - Use `$caro-svelte-ui-designer` when turning route-builder skeletons into polished admin/account/storefront pages.
   - Preserve Superforms ids, actions, `use:enhance`, hidden fields, file proxies, validation messages, submitting state, and server-owned data contracts.
   - Do not add client-only fake CRUD, top-level `fetch()`, server imports, db imports, Drizzle imports, or R2 imports in `+page.svelte`.
   - Use Svelte MCP autofixer after Svelte component edits.

7. Review
   - Use `$caro-review`.
   - Check route boundaries, transactions, R2 compensation, AppError use, access control, notification boundaries, tests, docs drift, and hallucinated imports.
   - If docs and code disagree, update docs or stop before behavior changes.

## Current Product Create Contract

The admin new-product workflow is a multi-entity service write owned by `src/lib/server/modules/products/products.service.ts`.

- `createProduct()` accepts form-level fields for selected `tagIds`, `newTagNames`, optional `dropId`, uploaded `images`, `primaryImageIndex`, draft variant colors (`variants`), and per-image `imageMetadata`.
- Draft variant colors carry a client-side `clientId`; image metadata and size-level variants reference that ID through `variantColorClientId` until the service maps it to the generated variant color ID.
- Product image metadata is one row per uploaded file and may set variant color assignment, alt text, position, and primary state. The service enforces one primary image per color card scope.
- Product create routes must not write `product_variant_color`, `product_variant`, `product_image`, `product_tag`, `tag`, or `drop_product` directly. They validate through module form schemas and call `createProduct()`.
- Drop assignment from the product form is service-owned. `dropProduct` remains a junction table with no generic CRUD route.
- Product media uploads require `ctx.event` and compensation cleanup in the service if any later database write fails.
- `ProductDTO.dropAssignment` is available for route/UI reads that need the current non-archived drop link.

## Current Product Edit Contract

The admin edit-product workflow is a full-form service write owned by `updateProductFull()` in `src/lib/server/modules/products/products.service.ts`.

- Product edit routes serialize variant color cards and image metadata into form fields, validate through `updateProductFormSchema`, and call `updateProductFull()`.
- Image metadata may update variant assignment, alt text, display `position`, primary state, deletion state, and new upload file mapping.
- Routes must not write `product_variant_color`, `product_variant`, `product_image`, `product_tag`, `tag`, or `drop_product` directly during edit flows.
- New edit-route uploads still require `ctx.event`; uploaded objects are cleaned up by the service if later validation or persistence fails.

## Notification Workflow

Use `$caro-notifications` for email/SMS senders, notification outbox, waitlist notification state, Queue/Cron/DLQ orchestration, or notification docs.

Current notification facts:

- `sendOtpEmail`, `sendWelcomeEmail`, `sendGoogleLinkedEmail`, `sendOrderConfirmationEmail`, `sendShippingUpdateEmail`, and `sendDropLaunchEmail` exist.
- `sendOtpSms`, `sendOrderConfirmationSms`, `sendShippingUpdateSms`, `sendPaymentUpdateSms`, `sendOrderStatusUpdateSms`, and `sendDropLaunchSms` exist.
- `notification_outbox` is implemented under `src/lib/server/modules/notifications/outbox`.
- Outbox notification types are `auth_welcome`, `auth_google_linked`, `order_confirmation`, `shipping_update`, `payment_update`, `order_status_update`, and `drop_launch`.
- `src/lib/server/infrastructure/notifications/outbox.dispatcher.ts` is orchestration.
- Queue producer/consumer bindings, Queue handlers, Cron recovery, and DLQ config are implemented.
- SMS purposes are `otp`, `transactional`, and `promotional`, backed by Text.lk purpose-specific sender IDs.

Rules:

- Domain services enqueue outbox intent inside the business transaction.
- Exception: Better Auth welcome and Google-linked lifecycle emails use outbox rows from database hooks; OTP SMS remains synchronous/direct where the auth flow expects thrown failures.
- Queue messages contain only `outboxId` and/or `idempotencyKey`.
- Queue/Cron/job code sends email/SMS and marks rows sent only after successful typed send results.
- Cron recovers pending, due failed, and stale locked outbox rows.
- DLQ is operational review only; DB outbox remains durable audit/retry state.
- Cloudflare KV is not notification outbox.

## Custom Agents

Only spawn subagents when the user explicitly asks for subagents, delegation, or parallel agent work.

Project custom agents live in `.gemini/agents`. Each TOML file must keep `name`, `description`, and `developer_instructions` aligned with current code paths.

Recommended usage:

```txt
schema-cartographer      read schemas, relations, comments, invariants
service-api-curator       plan public service APIs from product surfaces
service-architect         turn accepted APIs into implementation plan
service-builder           implement approved service-layer plan
notification-orchestrator plan/review notification outbox and transport work
svelte-route-builder      create service-backed route skeletons
svelte-integrator         refactor routes to service/form-schema calls
test-reviewer             review diff for architecture/test risks
```

Read-only agents should not edit. Use `service-builder` only for approved implementation with clear file ownership.

## Validation Commands

Run relevant checks after docs, service, route, or notification changes:

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

Expected current findings:

```txt
src/routes/media/[...key]/+server.ts is the allowed media R2 route exception.
src/lib/server/infrastructure/queue routes Cloudflare Queue batches by queue name.
src/lib/server/infrastructure/cron/scheduled-jobs.ts routes configured Cron expressions to service APIs.
notification_outbox, Queue bindings, Queue handlers, and notification Cron recovery are implemented.
```

## Codex Guidance

Current Codex guidance checked for this workflow:

- `AGENTS.md` gives durable repo guidance loaded before work.
- Skills package reusable workflows and should stay concise.
- Custom agents live under `.gemini/agents` or user agent folders and require `name`, `description`, and `developer_instructions`.
- Good Codex prompts include goal, context, constraints, and done-when criteria.

Reference:

```txt
https://developers.openai.com/codex/guides/agents-md
https://developers.openai.com/codex/skills
https://developers.openai.com/codex/subagents
https://developers.openai.com/codex/learn/best-practices
```
