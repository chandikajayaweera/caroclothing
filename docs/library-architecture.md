# `src/lib` Architecture

- **Audience:** project collaborators and coding agents
- **Status:** current as of 2026-07-18
- **Scope:** reusable application code under `src/lib`

## Canonical Structure

```txt
src/lib
|-- assets/                    Static assets imported by application code
|-- client/                    Browser-only state, SDK adapters, and runtime helpers
|   |-- auth/
|   |-- availability/
|   |-- env/
|   |-- payments/
|   `-- stores/
|-- components/                Svelte presentation and interaction components
|   |-- admin/                 Admin design system and admin domain components
|   `-- <storefront-feature>/  Storefront/account components grouped by feature
|-- server/                    Server-only application code
|   |-- db/                    Database client and aggregate Drizzle schema
|   |-- foundation/            Service context, guards, and cross-cutting utilities
|   |-- infrastructure/        Provider and platform adapters, including runtime context
|   |-- modules/               Business domains, schemas, forms, services, and DTOs
|   `-- orchestration/         Runtime-neutral Queue, Cron, and job workflows
`-- shared/                    Environment-neutral helpers and contracts
    |-- admin/
    `-- auth/
```

Do not add a generic `modules` directory below `client` or `shared`. Their direct child folders already name the owning feature or concern.

## Dependency Direction

```txt
shared <- client <- components <- route UI
shared <- server <- server routes and Worker entrypoints
```

- `shared` must remain environment-neutral. It must not import from `client`, `components`, `routes`, or server-only modules.
- `client` may import from `shared`, but must not runtime-import server modules.
- `components` may import from `client` and `shared`, but must not runtime-import server modules.
- `server` may import from `shared`, but must not import from `client` or `components`.
- Type-only imports from service DTO/type files are allowed in client-rendered code when they describe server load or API payloads. They must stay `import type`; move a contract into `shared` only when it is genuinely environment-neutral and does not pull Drizzle or server implementation types into `shared`.
- Routes remain framework adapters. Server routes call services and infrastructure adapters permitted by `docs/service-layer-architecture.md`; route UI composes components and client helpers.

## Folder Rules

### Client

- Group browser code by responsibility directly under `src/lib/client`.
- Keep singleton state in `client/stores` and browser SDK loading in the owning provider feature.
- Colocate focused tests with the implementation they verify.
- Do not use `client` as a home for reusable environment-neutral helpers; those belong in `shared`.

### Components

- Group storefront components by product feature (`bag`, `checkout`, `product`, `reviews`) or shell responsibility (`layout`, `shared`, `ui`).
- Admin components use the canonical folders `categories`, `controls`, `data-display`, `feedback`, `filters`, `forms`, `inventory`, `layout`, `notifications`, `overlays`, `products`, and `sidebar`.
- Keep component filenames in PascalCase. The `Admin` prefix is intentional because it makes imports and diagnostics unambiguous outside the admin folder.
- Remove obsolete scaffolds once production routes no longer consume them; do not retain placeholder compatibility components.

### Server

- Preserve the `db`, `foundation`, `infrastructure`, `modules`, and `orchestration` boundaries.
- Keep `db` as the top-level persistence composition root. It owns the D1-backed Drizzle client,
  aggregate schema, and guarded batch primitives; do not move it wholesale below infrastructure.
- Cloudflare binding/runtime context belongs in `infrastructure/cloudflare`; foundation must not own
  request-scoped platform environment storage or runtime singletons.
- Domain module `index.ts` files are curated public module surfaces. Internal prepared D1 batch builders may be imported from their concrete service file only by server code composing the owning atomic batch.
- Do not create re-export shims for moved server files. Update consumers to the one canonical path.
- Notification outbox state remains a domain module; provider delivery remains infrastructure; Queue/Cron processing remains orchestration; Cloudflare event translation remains infrastructure.
- ESLint enforces the major import boundaries: routes cannot import DB/Drizzle primitives, non-media
  routes cannot import R2 primitives, server code cannot import client/components, shared code stays
  environment-neutral, and orchestration cannot import Cloudflare runtime adapters.

### Shared

- Organize shared code by concern, not by a generic `modules` bucket.
- `shared/auth` owns Better Auth access-control definitions and environment-neutral auth profile/error helpers.
- `shared/admin` owns environment-neutral admin formatting, option, and status helpers.
- Keep small single-purpose utilities such as `media.ts`, `sentry.ts`, and `slug.ts` flat until a real multi-file concern exists.

## Adding Or Moving Files

Before adding or moving reusable code:

1. Classify its runtime: browser-only, server-only, Svelte UI, or environment-neutral.
2. Choose the narrowest owning feature or layer.
3. Search all imports and documentation before moving it.
4. Move tests with their implementation and update canonical guidance in the same change.
5. Do not add legacy shims; stale-path searches must return no results.
6. Run `pnpm tree`, targeted tests, `pnpm check`, `pnpm lint`, `pnpm build`, and the architecture boundary searches documented in `docs/service-layer-architecture.md` for broad reorganizations.
