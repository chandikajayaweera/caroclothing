# Caro Clothing Development Context

This file defines the foundational mandates and technical context for Caro Clothing. Adhere strictly to these guidelines.

## 🛠 Core Stack & Tools

- **Framework**: Svelte 5 (Runes) + SvelteKit.
- **Styling**: Tailwind CSS 4.
- **Database**: Turso/LibSQL (SQLite-compatible) managed via Drizzle ORM.
- **Authentication**: Better Auth (Phone OTP, Google One Tap, Anonymous sessions).
- **Media**: Cloudflare R2 (keys stored in DB, resolved via `media/utils.ts`).
- **Deployment**: Cloudflare Workers.

## 📐 Architecture Principles

- **Modular Schemas**: Database schemas live in `src/lib/server/modules/[module]/[module].drizzle.ts` and are aggregated in `src/lib/server/db/schema.ts`.
- **Zod First**: Use `drizzle-zod` for validation. All schemas have insert, select, and update variants.
- **ID Strategy**: Use `nanoid` for all primary keys.
- **Media Handling**: Never store full URLs in the DB. Store R2 keys and resolve via `mediaUrl(key)` from `$lib/server/infrastructure/media`.
- **Svelte 5 Runes**: Strictly use `$state`, `$derived`, `$effect`, and `$props`. Never use legacy Svelte 4 syntax.
- **Two-Tier Product Model**: All products have a `tier` — either `drop` (limited, event-based, hype ritual) or `core` (always available, restockable). This distinction drives inventory behaviour, pricing bands, marketing mechanics, and UX patterns throughout the app.
- **Centralized Errors**: ALWAYS use the structured custom errors defined in `src/lib/server/infrastructure/errors/index.ts` instead of throwing generic JavaScript `Error` objects. If a specific domain error class or `ErrorCode` does not exist for your use case, add it there first.

## 🧠 Intelligence Guidelines

### Skills Usage

- **Strategic Product & Architecture Decisions**: Use `caro-product-designer` whenever making decisions about what to build, what goes on a page, how to prioritize features, information architecture, conversion rate optimization, or how to balance brand identity against user needs and business goals.
- **UX, UI & Flow Design**: Use `caro-ux-strategy` whenever designing or evaluating any customer-facing experience — component behaviour, shopping/checkout/auth flows, brand-to-UI translation, micro-copy, tier-aware experience differences (drop vs core), and trust patterns.
- **Email & SMS Notifications**: Use `caro-notifications` when adding/modifying email/SMS helpers, semantic senders, notification outbox state, Queue/Cron/DLQ transport, or waitlist notification marking.
- **Architecture Compliance & Reviews**: Use `caro-review` when reviewing diffs for CaroClothing architecture compliance, service-layer correctness, notification boundaries, or safety checks.
- **Route Refactoring**: Use `caro-route-refactor` when refactoring SvelteKit routes to call service functions and Superforms schemas instead of DB/R2 primitives.
- **Service API Planning**: Use `caro-service-api-planner` when planning service-layer public APIs before implementation by reading schemas, routes, and business goals.
- **Service Layer Implementation**: Use `caro-service-layer` when implementing or modifying service modules, service DTOs, module form schemas, transactions, R2, or service-owned outbox state.
- **Svelte Route Scaffolding**: Use `caro-svelte-route-builder` to create/modify SvelteKit routes (server files & bare skeletons) wiring service functions and Superforms.
- **Svelte UI Polishing**: Use `caro-svelte-ui-designer` to design and implement production-ready responsive Caro UI from route-builder skeletons.

### Custom Subagents

If a task warrants delegating work to a specialized background agent, define and invoke a subagent using the `define_subagent` and `invoke_subagent` tools. Refer to `.gemini/agents/` for TOML template contexts:

- **schema-cartographer**: For mapping Drizzle schemas, relations, comments, and application-layer invariants (read-only).
- **service-api-curator**: For planning and curating service-layer API requirements from schemas, storefront/admin needs, and business goals (read-only).
- **service-architect**: For planning service-layer changes, transactions, R2 side effects, and notification boundaries (read-heavy).
- **service-builder**: For implementing approved service-layer plans with transactions, DTOs, errors, media compensation, and validation.
- **notification-orchestrator**: For planning/reviewing email/SMS helpers, notification outbox state, and Queue/Cron/DLQ transport.
- **svelte-integrator**: For updating SvelteKit routes to call services and Superforms schemas correctly.
- **svelte-route-builder**: For creating route server files and bare page skeletons from module services.
- **test-reviewer**: For reviewing diffs for architecture violations, missing tests, unsafe business logic, and boundary mistakes (read-only).

### Documentation & Research

- **Svelte MCP**: ALWAYS use `svelte_list-sections` and `svelte_get-documentation` for any Svelte 5 or SvelteKit questions. Run `svelte_svelte-autofixer` before submitting Svelte code.
- **Context7**: ALWAYS use `mcp_context7_resolve-library-id` and `mcp_context7_get-library-docs` for:
  - Better Auth configuration and plugins.
  - Drizzle ORM syntax and migrations.
  - Tailwind CSS 4 features.
  - Cloudflare Workers / R2 APIs.
  - Zod v4 validation schemas.

## 🎨 Visual Identity

Full brand system in `.gemini/skills/caro-ux-strategy/references/brand.md`. Quick reference:

- **Colors**: Void `#0A0A0A` · Bone `#F8F5F0` · Charcoal `#1C1C1C` · Ash `#B4AFA8` · Volt `#C8FF00`
- **Typography**: Bebas Neue (display) · Space Mono (mono/metadata) · DM Sans (body/UI)
- **Volt is sacred** — reserve for: primary CTAs, low-stock signals, drop announcements, active states. Nothing else.

## 🚀 Workflows

- **Local Dev**: `pnpm run dev`
- **Database**:
  - `pnpm run db:generate` — Create migrations after schema changes.
  - `pnpm run db:push` — Push schema to the database.
  - `pnpm run db:studio` — Visual schema explorer.
- **Auth**: `pnpm run auth:schema` — Regenerate auth-specific Drizzle schema. BetterAuth-managed — never edit `auth.drizzle.ts` manually.
- **Types**: `pnpm run cf-typegen` — Regenerate Cloudflare Worker binding types.
