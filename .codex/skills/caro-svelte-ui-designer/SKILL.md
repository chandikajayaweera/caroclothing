---
name: caro-svelte-ui-designer
description: Design and implement production-ready CaroClothing SvelteKit UI from route-builder skeletons. Use when upgrading +page.svelte files created by caro-svelte-route-builder, polishing admin/account/storefront route pages, preserving Superforms wiring, creating responsive mobile/tablet/desktop control panels or dashboards, and aligning interfaces with docs/caro_brand_identity.html.
---

# Caro Svelte UI designer

## Purpose

Turn route-builder skeleton pages into production-ready Caro interfaces. Keep server behavior, data contracts, service boundaries, and Superforms wiring intact. Focus on layout, responsive behavior, content priority, interaction states, accessibility, and brand alignment.

This skill is the UI companion to `caro-svelte-route-builder`: route builder owns correctness and skeleton wiring; this skill owns the final route UI.

## Required reading

Before planning or editing, read:

- target route `+page.server.ts`
- target route `+page.svelte`
- `docs/caro_brand_identity.html`
- nearby finished routes in the same context:
  - admin: `src/routes/(protected)/app/**/+page.svelte`
  - account: `src/routes/(protected)/account/**/+page.svelte`
  - storefront: `src/routes/**/+page.svelte`
- shared UI/layout components under `src/lib/components`
- existing app styles and icon usage

Use the Svelte MCP autofixer after changing Svelte components. Use Svelte MCP docs when syntax, runes, routing, actions, attachments, or SvelteKit behavior is uncertain.

## Planning first

Before editing, output a compact UI plan with:

- route context: `ADMIN`, `ACCOUNT`, or `STOREFRONT`
- page purpose and primary user task
- content priority:
  - primary: always visible
  - secondary: tablet/desktop visible, lower or collapsible on mobile
  - tertiary: desktop-first, hidden/collapsed/detail-only on smaller screens
- mobile layout for `320-767px`
- tablet layout for `768-1199px`
- desktop layout for `1200px+`
- data-dense areas and table/card transformations
- forms, filters, destructive actions, empty states, loading/submitting states, and messages
- any missing server data that blocks a useful UI

If running interactively, wait for approval after the UI plan unless the parent/user explicitly says to proceed.

## Route and form preservation

Preserve all route-builder behavior:

- Keep every `superForm(...)` instance.
- Keep every `use:enhance`, method, action URL, input `name`, hidden field, and form id behavior.
- Keep `bind:value`, `bind:checked`, constraints, field errors, form messages, and submitting state.
- Keep plain GET forms for filters and search.
- Do not add mock data or client-only fake CRUD.
- Do not import server modules, database helpers, Drizzle, R2, email, or SMS from `+page.svelte`.
- Do not call `fetch()` at component top level or during SSR. Use `+page.server.ts`/`load()` data, or `onMount()` only for browser-only fetches.
- Do not edit `+page.server.ts` unless a tiny display-only data gap blocks the UI. Report larger data/API gaps instead of inventing client workarounds.

## Brand system

Read `docs/caro_brand_identity.html` and apply these interface rules:

- Use a dark-first foundation: Void `#0A0A0A`, Charcoal `#1C1C1C`, Bone `#F8F5F0`, Ash `#B4AFA8`, Volt `#C8FF00`.
- Use Volt sparingly for primary actions, active states, selected rows, critical highlights, and key alerts.
- Use warm off-white text, muted grey metadata, and clear separators.
- Use `font-display`/Bebas only for major headings or high-impact labels.
- Use `font-mono`/Space Mono for metadata, IDs, SKUs, timestamps, codes, table headers, and action labels.
- Use readable sans/body typography for descriptions, form content, and dense data.
- Keep copy short, direct, and confident. Avoid corporate filler.
- Avoid gradients, glassmorphism, colorful shadows, decorative orbs, bokeh, soft SaaS styling, nested cards, and overly rounded panels.

## Responsive layout rules

Design three layouts, not one shrinking layout.

Mobile `320-767px`:

- Use a single column.
- Put the primary task, key action, critical alerts, and key metrics first.
- Convert complex tables into stacked cards or compact list rows.
- Show only 3-5 key fields per record; move secondary fields to details, expansion, or lower sections.
- Put filters in an expandable section, drawer, modal, or bottom sheet.
- Avoid sidebars and dense multi-chart grids.
- Keep tap targets at least 44px high.
- Avoid hover-only interactions.
- Use pagination or load more instead of wide tables where possible.

Tablet `768-1199px`:

- Use one or two columns depending on content density.
- Keep main dashboard content visible.
- Keep essential filters visible; move advanced filters behind a collapsed section.
- Use two-column card grids where useful.
- Keep tables only when readable; reduce columns to identifiers, status, date/owner/value, and action.
- Hide low-priority metadata columns or move them into expandable details.
- Use strong section headers to preserve hierarchy.

Desktop `1200px+`:

- Use multi-column layouts and high density.
- Keep filters persistent when they are important.
- Use full comparison tables for data-heavy admin screens.
- Use 3-4 KPI cards per row or a 12-column grid for complex dashboards.
- Use side panels for details, edit forms, logs, metadata, or previews when useful.
- Support bulk selection, column controls, export, or keyboard shortcuts only when the server/UI already supports them.
- Keep high-impact headers restrained so the page remains operational, not campaign-like.

## Data-dense UI rules

Desktop tables:

- Use full tables for comparison-heavy data.
- Keep important identifiers visible.
- Use clear separators, compact rows, muted metadata, and strong active states.
- Use horizontal scroll only when necessary.
- Use Volt only for active sort, selected state, primary action, or critical highlight.

Tablet tables:

- Reduce columns.
- Prioritize status, name/title, owner/customer, date, key amount/count, and primary action.
- Move extra fields into expandable rows or detail panels.

Mobile tables:

- Avoid complex tables.
- Transform rows into cards/list items.
- Show the primary identifier, status, 2-4 metadata points, and primary action.
- Use `font-mono` for IDs, SKUs, dates, and codes.

Charts and visualizations:

- Desktop may use multiple charts side by side.
- Tablet should use fewer charts per row with readable labels.
- Mobile should use one simple chart per section with a text summary above it.
- Do not overuse Volt in charts; reserve it for the most important series, threshold, or selected value.
- Provide text alternatives or summary values for charts.

## Component rules

- Prefer existing repo components and patterns over new abstractions.
- Use `lucide-svelte` icons when icons help scanability.
- Use buttons for commands, checkboxes/toggles for binary state, selects for enums/statuses, textareas for long text, and cards for KPIs, alerts, mobile records, and contained panels.
- Do not place cards inside cards.
- Keep cards/panels sharp and content-led, with subtle borders and no decorative effects.
- Use stable dimensions for tables, media previews, icon buttons, sticky action bars, cards, and controls to prevent layout shift.
- Keep text inside controls readable and non-overlapping at every breakpoint.
- Use semantic headings in order, real labels, visible focus states, `aria-invalid` for invalid fields, and accessible names for icon-only controls.
- Do not rely on color alone for status.

## Forms, filters, and actions

Forms:

- Mobile: single column, full-width controls, grouped sections, clear save action.
- Tablet: one or two columns only if fields remain readable.
- Desktop: two-column forms plus side panel for previews, metadata, status, or destructive actions when useful.
- Keep required/high-frequency fields first.
- Separate destructive actions from save/update actions, especially on mobile.
- Show field errors near fields and form messages near the relevant form.
- For product create/edit forms, keep variant creation, media upload/preview, tag selection, material/care, and SEO inside the same service-backed form contract; do not split them into client-only workflows.
- For product image previews, hide the preview area when no images exist, keep cards compact on tablet/mobile, and open a modal/detail panel for image metadata such as variant assignment, alt text, position, and primary state.
- When existing tags are selected in a product form, remove them from the available-tag list and keep selected tags removable.

Filters:

- Mobile: drawer, modal, bottom sheet, or expandable panel; show active filters as chips when useful.
- Tablet: common filters inline, advanced filters collapsed.
- Desktop: persistent structured filter bar/panel when filtering is important.
- Keep filter labels direct and avoid helper-copy clutter.

Actions:

- Keep the primary action visible.
- Put secondary actions in a menu, lower section, or row action group on small screens.
- Use confirmations only for destructive or irreversible actions.
- Use submitting state to disable in-flight buttons.

## Performance and implementation

- Avoid rendering hidden desktop-only heavy sections on mobile when possible.
- Paginate large lists if pagination exists.
- Avoid expensive client-side transformations in markup; derive small view models in script when helpful.
- Lazy-load secondary visual panels only when the route/component already has a safe client pattern.
- Do not add decorative animation to data-heavy screens.
- Do not install new packages unless explicitly approved.

## Validation

After edits:

```powershell
pnpm.cmd check
pnpm.cmd exec eslint <touched-files>
pnpm.cmd lint
```

Also run:

```powershell
rg -n '\bfetch\s*\(' -g '*.svelte' -g '*.ts' src/routes src/lib/components src/lib/client
```

Use Svelte MCP autofixer on each changed Svelte component. For substantial UI work, start or reuse a dev server and inspect desktop, tablet, and mobile viewports; verify no accidental horizontal overflow except intentional table containers.

## Final response

Report:

1. Pages changed
2. Responsive decisions for mobile/tablet/desktop
3. Superforms/server wiring preserved
4. Validation commands and results
5. Residual risks, server data gaps, or existing unrelated lint debt
