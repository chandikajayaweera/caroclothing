---
name: caro-svelte-route-builder
description: Create or modify CaroClothing SvelteKit routes for a target module by wiring service-layer functions, module form schemas, route AppError adapters, and Superforms into production-ready +page.server.ts files plus bare, unstyled +page.svelte skeletons. Use when building admin, account, or storefront route scaffolds from existing Caro service modules, replacing placeholder scaffold pages, or generating route inventory before route implementation.
---

# Caro Svelte route builder

## Required reading

Before planning or editing, read:

- `docs/service-layer-architecture.md`
- `docs/codex-service-layer-workflow.md`
- target module `*.drizzle.ts`, `*.service.ts`, `*.forms.ts`, `*.types.ts`, and `index.ts`
- `src/lib/server/infrastructure/errors/route-adapter.ts`
- `src/lib/server/foundation/context.ts`
- `src/lib/server/foundation/guards.ts`
- reference routes:
  - `src/routes/(protected)/app/orders/+page.server.ts`
  - `src/routes/(protected)/app/reviews/+page.server.ts`
  - `src/routes/(protected)/app/shipping/+page.server.ts`
  - `src/routes/(protected)/account/addresses/+page.server.ts`
  - `src/routes/(protected)/app/bag/+page.server.ts`

Use Context7 MCP for current `sveltekit-superforms` API before writing Superforms code. Use Svelte MCP for uncertain SvelteKit or Svelte 5 syntax.

## Collaboration and edit discipline

This skill is responsible for route correctness, service integration, route boundaries, Superforms wiring, AppError mapping, and bare page skeletons only. It is not responsible for final UI polish; another agent handles polished admin/storefront UI.

You are not alone in the codebase. Do not revert, overwrite, or "clean up" edits made by others unless they are directly required for the approved route work. Work with the current files as they exist.

Before importing anything, verify that the import path exists. Prefer missing-prerequisite reporting over invented helpers, imports, schemas, types, or service APIs.

Edit only the smallest route, module-index, and form-schema files needed for the approved route plan.

If running interactively, wait for approval after the route inventory unless the parent/user explicitly says to proceed.

Do not put notification payloads or customer PII into queue messages. If service calls enqueue notifications, pass the publisher returned by `createCloudflareNotificationWakeups(platform)` as `notificationWakeups` through `ServiceContext`.

## Route inventory first

For the target module, identify all user surfaces:

- Admin: `src/routes/(protected)/app/{module}/`
- Account: `src/routes/(protected)/account/{module}/`
- Storefront: `src/routes/{module}/`

Output a table before editing with:

- route file path and URL
- LIST, DETAIL, or FORM-ONLY page
- `load()` service calls
- action names and service calls
- form schemas from `{module}.forms.ts`
- pre-populated forms
- existing route status and whether a placeholder scaffold must be replaced

Do not create CRUD routes for audit, internal, or junction tables. Display those inline as read-only parent-route data only when useful.

## Server route rules

Import route dependencies only from:

- `$lib/server/modules/{module}` for public service functions, form schemas, and types
- `$lib/server/foundation/context` for type-only `ServiceContext`
- `$lib/server/infrastructure/errors/route-adapter`
- `$lib/server/infrastructure/cloudflare` only for `createCloudflareNotificationWakeups`
- `@sveltejs/kit`
- `sveltekit-superforms/server`
- `sveltekit-superforms/adapters`
- `./$types`

Never import `db`, Drizzle tables, Drizzle query helpers, `.drizzle` files, R2 helpers, email senders, or SMS senders from business routes. `src/routes/media/[...key]/+server.ts` is the only R2 route exception.

Use local context helpers:

```ts
import { createCloudflareNotificationWakeups } from '$lib/server/infrastructure/cloudflare';

function getAdminContext(locals: App.Locals, platform?: App.Platform): ServiceContext {
	return {
		actor: locals.user,
		notificationWakeups: createCloudflareNotificationWakeups(platform)
	};
}

function getAccountContext(locals: App.Locals): ServiceContext {
	return { actor: locals.user };
}

function getStorefrontContext(locals: App.Locals): ServiceContext {
	return { actor: locals.user ?? null };
}
```

For account routes, redirect unauthenticated or anonymous users before any `try` block:

```ts
function requireAccountContext(locals: App.Locals, url: URL): ServiceContext {
	if (!locals.user || locals.user.isAnonymous) {
		const redirectTo = `${url.pathname}${url.search}`;
		throw redirect(302, `/sign-in?redirectTo=${encodeURIComponent(redirectTo)}`);
	}

	return { actor: locals.user };
}
```

Admin layout already checks `adminUser`; still pass actor so service guards enforce authorization. If route services enqueue notifications, include `notificationWakeups` from `createCloudflareNotificationWakeups(platform)`.

## Superforms and actions

Use:

```ts
import { fail } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { message, superValidate, withFiles } from 'sveltekit-superforms/server';
```

Rules:

- use module form schemas, not Drizzle base schemas, unless a required form schema is missing
- if a form schema is missing, list it as a prerequisite instead of inventing imports
- each action is named; do not use one default catch-all action
- every form has stable `id` equal to the camelCase action intent, and the same `id` is used in load and action validation
- initialize every page form in `load()`, including action-only forms
- use `errors: false` for create forms whose required default fields are intentionally blank
- use `Promise.all()` for independent reads and form initialization
- wrap service calls in `load()` with `try/catch` and `throwHttpFromAppError(error)`
- validate before service calls in actions
- return `fail(400, { form })` for validation failures
- return `message(form, '...')` for success
- return `formFailFromAppError(form, error)` for service errors
- pass full `event` in `ctx.event` for file upload services
- wrap validation failures and service-error form returns in `withFiles(...)` when the schema includes `File` or `File[]`
- return count details in success messages for cleanup/bulk actions

Parse URL params through local helpers and form schemas. Do not pass raw strings into typed service options. Return filter state from list loads so the page can reflect active filters.

## Page skeleton rules

Create bare Svelte 5 skeletons only. No Tailwind, CSS classes, polished layout, mock data, or placeholder scaffold components.

Use:

```svelte
<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import type { ActionData, PageData } from './$types';

	let { data, form: actionData }: { data: PageData; form?: ActionData } = $props();
</script>
```

Rules:

- initialize one `superForm()` per returned mutation form
- use `dataType: 'json'` and `filesProxy(...)` for JSON Superforms that include `File[]` fields
- use each form's `enhance`, `form`, `errors`, `constraints`, `message`, and `submitting` stores where relevant
- use plain GET forms for filters/search; do not use Superforms for filters
- do not call `fetch()` at component top level or during SSR; put route data reads in `load()`/`+page.server.ts`, and use `onMount()` only for browser-only fetches
- render real `data` from `PageData` in a simple `<table>` or `<ul>`
- bind mutation fields to `$form.field`
- display `$errors.field[0]` near fields
- spread `$constraints.field` on basic inputs when available
- disable submit buttons while `$submitting`
- drive enum/district/select options from server-provided `data.*Options`
- use `<form method="POST" action="?/actionName" use:enhance>` for mutations
- use hidden inputs for row IDs in inline row actions
- use plain `<img>` only when media URLs are already in DTO data

## Final response

After implementation, respond with:

1. Files changed
2. Routes created or modified
3. Missing form schemas or module exports, if any
4. Validation commands and results
5. Residual risks or assumptions

Run or report inability to run:

```powershell
pnpm check
pnpm lint
rg -n '\$lib/server/db|drizzle-orm|media/r2' src/routes
```

Finally list missing form schemas, missing module index exports, residual risks, and assumptions.
