# Caro Clothing Development Context

This file defines the foundational mandates and technical context for Caro Clothing. Adhere strictly to these guidelines.

## 🛠 Core Stack & Tools

- **Framework**: Svelte 5 (Runes) + SvelteKit.
- **Styling**: Tailwind CSS 4 (Vanilla CSS preferred for complex components).
- **Database**: Cloudflare D1 (SQLite) managed via Drizzle ORM.
- **Authentication**: Better Auth (Phone OTP, Google One Tap, Anonymous sessions).
- **Media**: Cloudflare R2 (keys stored in DB, resolved via `media/utils.ts`).
- **Deployment**: Cloudflare Workers.

## 📐 Architecture Principles

- **Modular Schemas**: Database schemas are defined in `src/lib/server/modules/[module]/[module].drizzle.ts` and aggregated in `src/lib/server/db/schema.ts`.
- **Zod First**: Use `drizzle-zod` for validation.
- **ID Strategy**: Use `nanoid` for all primary keys.
- **Media Handling**: Never store full URLs in the DB; store R2 keys and use the resolution utility.
- **Svelte 5 Runes**: Strictly use `$state`, `$derived`, `$effect`, and `$props`. Avoid legacy Svelte 4 syntax.

## 🧠 Intelligence Guidelines

### Skills Usage
- **Strategic Decisions**: Activate `caro-product-designer` for homepage architecture, feature prioritization, and CRO strategy.
- **UX & UI**: Activate `caro-ux-strategy` for component behavior, brand-to-UI translation (colors: Void/Bone/Volt), and voice/copy decisions.

### Documentation & Research
- **Svelte MCP**: ALWAYS use `svelte_list-sections` and `svelte_get-documentation` for any Svelte 5 or SvelteKit questions. Run `svelte_svelte-autofixer` before submitting Svelte code.
- **Context7**: ALWAYS use `mcp_context7_resolve-library-id` and `mcp_context7_query-docs` for:
  - Better Auth configuration and plugins.
  - Drizzle ORM syntax and migrations.
  - Tailwind CSS 4 features.
  - Cloudflare Workers/D1/R2 APIs.

## 🎨 Visual Identity (from `caro-ux-strategy`)

- **Primary Colors**: 
  - Void (#0A0A0A) - Backgrounds/Luxury.
  - Bone (#F8F5F0) - Text surfaces/Trust.
  - Volt (#C8FF00) - Action/Urgency (sacred).
- **Typography**:
  - Headers: Bebas Neue.
  - Meta/Metadata: Space Mono.
  - Body: DM Sans.

## 🚀 Workflows

- **Local Dev**: `pnpm run dev`
- **Database**:
  - `pnpm run db:generate` - Create migrations.
  - `pnpm run db:push` - Push local schema to D1.
- **Auth**: `pnpm run auth:schema` - Regenerate auth-specific Drizzle schema.
