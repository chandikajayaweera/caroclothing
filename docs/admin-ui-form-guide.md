# Caro Clothing Admin UI Form Guide

This document establishes the UI patterns, typography guidelines, and layout rules for administrative forms within Caro Clothing. The goal is to balance Caro's raw streetwear aesthetic with day-to-day usability, clarity, and speed for store operators.

---

## 🎨 Design Tokens & Contrast

Our base background is **Void** (`#0A0A0A`). To ensure forms remain highly readable and reduce eye strain:

### 1. Containers (Cards)

- **Do not** use semi-transparent backgrounds like `bg-charcoal/25` for container cards.
- **Do** use solid, opaque `bg-charcoal` (`#1C1C1C`) for section cards. This creates a solid anchor for inputs.
- Borders for cards should be `border border-charcoal` or `border border-ash/15`.

### 2. Form Fields (Inputs / Selects / Textareas)

- Inputs must contrast clearly against the card background.
- Use **Void** background for input elements: `bg-void`.
- Borders: `border border-ash/30`.
- Hover state: `border border-ash/60`.
- Focus state: `border border-volt` (neon green) and focus outline/ring.
- Target height for all main inputs: `min-h-11` (approx 44px) for excellent touch targets.

```html
<!-- Canonical Input Example -->
<input
	class="min-h-11 w-full border border-ash/30 bg-void px-3.5 py-3 font-sans text-sm text-bone placeholder-ash/50 transition-colors outline-none hover:border-ash/60 focus:border-volt"
/>
```

---

## 🔤 Typography & Roles

Caro's display font (**Bebas Neue**) is bold and aggressive. To avoid visual exhaustion, restrict font families as follows:

| Element                                  | Font Family              | Size                     | Case                  | Color                       |
| :--------------------------------------- | :----------------------- | :----------------------- | :-------------------- | :-------------------------- |
| Page Heading (`h1`)                      | `font-display`           | `text-4xl` to `text-6xl` | Upper                 | `text-bone`                 |
| Section Heading (`h2`, `h3`)             | `font-display`           | `text-2xl` to `text-3xl` | Upper                 | `text-bone`                 |
| Field Labels                             | `font-sans` (DM Sans)    | `text-xs` or `text-sm`   | Mixed (Sentence Case) | `text-ash`                  |
| Input Values & Options                   | `font-sans` (DM Sans)    | `text-sm`                | Mixed                 | `text-bone`                 |
| Helper Text / Error Msg                  | `font-sans` (DM Sans)    | `text-xs`                | Mixed                 | `text-ash` / `text-red-400` |
| Technical Identifiers (Slug, Price, Hex) | `font-mono` (Space Mono) | `text-xs` to `text-sm`   | Upper/Mixed           | `text-bone`                 |

> [!NOTE]
> Mark required fields clearly by appending a red asterisk: `<span class="text-red-400 font-sans ml-0.5">*</span>`.

---

## 🎛 Toggles & Controls

Replace raw, tiny HTML checkboxes with custom toggle switches that have a minimum 40px hit area (e.g. using the `AdminToggle` component).

- **Opaque state transmission in multipart forms**: When forms use `enctype="multipart/form-data"` (e.g. edit pages supporting file uploads) rather than JSON dataType, standard buttons or unchecked checkboxes are omitted from `FormData`. Toggles must always output a `<input type="hidden" {name} value={checked ? 'true' : 'false'} />` tag to guarantee boolean values are sent.
- **Server-side Schema Coercion**: Zod form schemas must preprocess these string values (e.g. using `z.preprocess`) to map `"true"` and `"false"` to actual booleans. Use Zod `.extend({...})` instead of `.safeExtend({...})` on the schema to permit overriding base database schema types.
- **Svelte 5 `$bindable()` Fallback Restrictions**: Avoid defining default/fallback values on the child component props destructured with `$bindable(...)` (e.g. use `checked = $bindable()` instead of `checked = $bindable(false)`). When a child prop has a fallback value, Svelte 5 strictly forbids parents from binding to an `undefined` value, throwing a fatal `props_invalid_value` crash. Handle default fallback values internally inside `$effect.pre` in the child or ensure the parent state is never `undefined`.

```html
<!-- Custom Toggle Switch Markup -->
<input type="hidden" name="isActive" value="true" />
<button
	type="button"
	role="switch"
	aria-checked="true"
	class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-charcoal transition-colors duration-200 ease-in-out focus:ring-2 focus:ring-volt focus:outline-none"
>
	<span
		class="pointer-events-none inline-block h-5 w-5 translate-x-5 transform rounded-full bg-void shadow ring-0 transition duration-200 ease-in-out"
	></span>
</button>
```

---

## 📦 Progressive Disclosure & Collapsible Lists

When managing repeated complex components (e.g. product variants), collapse details by default and summarize properties.

### Collapsed Variant Card Pattern

- **Visuals**: A sleek row showing a color indicator circle, color name, price, sizes, and count of images.
- **Trigger**: Click anywhere on the header to expand/collapse.
- **Benefits**: Prevents page-scrolling exhaustion on mobile.

---

## 🛒 Sticky Action Bar

For lengthy admin workflows on mobile and tablet screens, key page actions must be stuck to the viewport edge.

- **Placement**: `fixed bottom-0 left-0 right-0 z-40 bg-void border-t border-charcoal`
- **Actions**: "Save Draft" (programmatic draft status submit) and "Publish/Create Product".

---

## ⚠️ Active Feedback & Validation

### Category Autocomplete

- Display matching categories in a clean absolute popup.
- Keep selection simple, allowing users to type and search.

### Snapshot Overview Panel

- Make the panel `sticky` on desktop.
- Highlight validation warnings directly (e.g., "Missing product name", "No category assigned") in a high-contrast format.
- Show variant pricing ranges instead of only one price.
- Product edit snapshots should read like a compact storefront product card: main product image, title, selected color, selected size, selling price, optional original price with strikethrough, category metadata, and warnings.
- Snapshot thumbnail clicks should only change the selected preview image. The full image detail popup opens only from the large preview image.
- Product image detail panels should allow editing image alt text and display order while preserving service-backed serialized image metadata.
- **Carousel Arrow Controls**: Both the Snapshot sidebar preview image card and the detailed image preview modal must display Left/Right arrow overlay buttons when the variant has multiple images, allowing operators to easily cycle through the photography without closing the modal or clicking tiny thumbnails.

---

## 🛡 Unsaved Navigation Guards

When an operator edits text inputs, adjusts variant options/sizes, or manages product photography, the page state becomes dirty. Navigating away accidentally can cause data loss.

- **Warning Modal**: Use the reusable `AdminUnsavedChangesModal` component.
- **Dirty Checking**:
  - Evaluate the superform `$isTainted` store.
  - For complex state collections (like JSON-serialized variant lists or files list) not managed by Superforms fields, compare current local state against the initial database load values.
  - Replace page exit links (e.g. "Back to products") with click handlers that perform this check and open the warning modal if dirty.

---

## 📐 Reusable Layout Templates

All admin screens are built on one of three unified layouts found in `$lib/components/admin/layout/` to enforce UI consistency:

### 1. `AdminListLayout` (Listing/Table Views)

- **Use Case**: Searchable directories of categories, products, or other records.
- **Features**: Built-in stats overview blocks, search query forms with advanced filters panel (featuring `slide` transitions), table grids, progressive pagination via link URLs, and custom card/row loading skeletons.

### 2. `AdminDetailLayout` (Object Details Views)

- **Use Case**: Read-only overview of specific items (e.g. category detail, product detail).
- **Features**: Top navigation back link, action buttons (edit/delete), responsive 2-column detail grid, and default native `fade` animations.

### 3. `AdminFormLayout` (Form New/Edit Views)

- **Use Case**: Adding new records or editing existing ones.
- **Features**: Wraps the form elements, handles loading/saving states (progress line indicator), structural left main column + right sticky summary preview sidebar, and sticky mobile action panels.

---

## 🌐 Same-Page Parameter Navigation & Data Invalidation

When utilizing query parameters (such as `?open=id` or `?query=search`) to control drawers, modals, or filter states on the same route/pathname:

- **Server Load Invalidation**: Changing query parameters client-side via `goto(...)` does not automatically trigger SvelteKit to rerun server-only load functions (`+page.server.ts`), as the client router does not track dependencies inside server-only code.
- **Enforcing Refresh**: Always pass `{ invalidateAll: true }` in the `goto` options when updating search parameters to force SvelteKit to refetch fresh data from the server.
- **UX Responsiveness**: When closing modals or toggling immediate UI states, update local reactive variables (e.g. `drawerOpen = false`) synchronously _before_ initiating the asynchronous `goto` call to ensure the interface responds instantly.
