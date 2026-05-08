---
name: caro-service-api-planner
description: Use when planning CaroClothing service-layer public APIs before implementation by reading Drizzle schemas, routes, admin/storefront needs, cron jobs, notification boundaries, helper modules, and business goals; outputs exact service API requirements without editing code.
---

# Caro service API planner

Plan only unless the user explicitly asks to implement.

## Required reading

- `docs/service-layer-architecture.md`
- `docs/codex-service-layer-workflow.md`
- Relevant `src/lib/server/modules/**/**.drizzle.ts`
- Existing service/type/form files for related modules
- Relevant storefront/admin/account/checkout routes
- Helper modules:
  - `src/lib/server/modules/errors/index.ts`
  - `src/lib/server/modules/media/r2.ts`
  - `src/lib/server/modules/media/utils.ts`
  - `src/lib/server/modules/env/index.ts`
  - `src/lib/shared/modules/access-control.ts`

For notification-related modules, also read email/SMS modules and cron scaffolding.

## Current codebase state

- Existing service modules: `auth`, `addresses`, `products`, `drops`, `wishlist`, `cart`, `shipping`.
- Existing internal service helpers: `inventory` has transaction helpers in `inventory.service.ts`; its module index exports schema/types only.
- Schema-only modules needing service plans: `orders`, `promotions`, `reviews`.
- Existing foundation helpers: `service-context.ts`, `auth/guards.ts`.
- Existing route helper: `errors/route-adapter.ts`.
- Planned/missing helpers: `service-utils.ts`.
- Existing drop sender: `sendDropLaunchEmail`.
- Missing drop SMS sender: `sendDropLaunchSms`.

## Planning rules

- Start from schema comments, constraints, relations, and current route/admin/storefront needs.
- Create business workflow APIs, not table CRUD wrappers.
- Do not expose generic CRUD for internal/audit/junction tables.
- Separate public-safe reads from privileged reads.
- Include `ServiceContext` on privileged reads/writes and media changes.
- Identify required transaction boundaries and internal Tx helpers.
- Identify R2/media side effects and compensation flows.
- Identify notification list/mark helpers separately from send orchestration.
- Do not invent helper imports; mark missing helpers as prerequisites.
- Keep API inputs object-shaped unless matching an established existing module pattern.

## Output

1. Files inspected
2. Business goals and user surfaces served
3. Schema invariants and application-layer rules
4. Existing helper modules to use and why
5. Public/storefront APIs
6. Customer/account/checkout APIs
7. Admin dashboard APIs
8. Cron/job APIs
9. Notification state APIs, if any
10. DTOs and derived fields
11. Internal Tx helpers needed
12. APIs/tables not to expose
13. Missing prerequisites or docs-vs-code mismatches
14. Validation commands
