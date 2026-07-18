---
name: caro-service-api-planner
description: Use when planning CaroClothing service-layer public APIs before implementation by reading Drizzle schemas, routes, admin/storefront needs, Queue/Cron jobs, notification boundaries, helper modules, and business goals; outputs exact service API requirements without editing code.
---

# Caro service API planner

Plan only unless the user explicitly asks to implement.

## Required reading

- `docs/service-layer-architecture.md`
- `docs/codex-service-layer-workflow.md`
- Relevant `src/lib/server/modules/**/**.drizzle.ts`
- Existing service/type/form files for related modules
- Relevant storefront/admin/account/checkout routes
- Helper modules under `src/lib/server/foundation`, `src/lib/server/infrastructure`, and `src/lib/shared/auth/access-control.ts`
- Notification outbox, email/SMS, Queue, Cron, and dispatcher files when notification work is involved

## Current state

- Existing services: `auth`, `addresses`, `products`, `wishlist`, `bag`, `shipping`, `promotions`, `inventory`, `orders`, `payments`, `reviews`.
- Inventory exposes curated admin stock APIs through its module index; internal `*Tx` helpers in `inventory.service.ts` remain direct-import server internals for bag/order transaction workflows.
- Schema-only modules needing service plans: none in current core service rollout.
- Existing foundations: `foundation/context.ts`, `foundation/guards.ts`, `foundation/utils.ts`.
- Existing route helper: `infrastructure/errors/route-adapter.ts`.
- Notification outbox, Queue/Cron orchestration, DLQ config, and semantic email/SMS senders are implemented.
- Outbox notification types include `auth_welcome`, `auth_google_linked`, `order_confirmation`, `shipping_update`, `payment_update`, and `order_status_update`.

## Planning rules

- Start from schema comments, constraints, relations, and current user surfaces.
- Create business workflow APIs, not table CRUD wrappers.
- Do not expose generic CRUD for internal/audit/junction tables.
- Separate public-safe reads from privileged reads.
- Include `ServiceContext` for privileged reads/writes, owner checks, media work, Queue wakeups, and cron/system work.
- Identify transaction boundaries and internal Tx helpers.
- Identify R2 side effects and compensation cleanup.
- Identify notification outbox state APIs separately from provider delivery orchestration.
- Queue messages contain only outbox identifiers, never full payloads or PII.
- Do not invent helper imports; mark missing helpers as prerequisites.
- Keep API inputs object-shaped unless matching an established module pattern.

## Output

1. Files inspected
2. Business goals and user surfaces
3. Schema invariants and application-layer rules
4. Existing helpers to use
5. Public/storefront APIs
6. Customer/account/checkout APIs
7. Admin/support APIs
8. Queue/Cron/job APIs
9. Notification outbox/state APIs, if any
10. DTOs and derived fields
11. Internal Tx helpers
12. APIs/tables not to expose
13. Missing prerequisites or docs-vs-code mismatches
14. Validation commands
