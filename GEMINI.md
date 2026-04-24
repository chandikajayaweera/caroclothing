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
- **Media Handling**: Never store full URLs in the DB. Store R2 keys and resolve via `mediaUrl(key)` from `media/utils.ts`.
- **Svelte 5 Runes**: Strictly use `$state`, `$derived`, `$effect`, and `$props`. Never use legacy Svelte 4 syntax.
- **Two-Tier Product Model**: All products have a `tier` — either `drop` (limited, event-based, hype ritual) or `core` (always available, restockable). This distinction drives inventory behaviour, pricing bands, marketing mechanics, and UX patterns throughout the app.

## 🧠 Intelligence Guidelines

### Skills Usage

- **Strategic Product & Architecture Decisions**: Use `caro-product-designer` whenever making decisions about what to build, what goes on a page, how to prioritize features, information architecture, conversion rate optimization, or how to balance brand identity against user needs and business goals.
- **UX, UI & Flow Design**: Use `caro-ux-strategy` whenever designing or evaluating any customer-facing experience — component behaviour, shopping/checkout/auth flows, brand-to-UI translation, micro-copy, tier-aware experience differences (drop vs core), and trust patterns.

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
