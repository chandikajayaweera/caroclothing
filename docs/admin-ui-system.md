# Admin UI System Guidelines

This document defines the design direction, token usage, and layout guidelines for the Caro Clothing administrative interface. All future AI edits and developer modifications must strictly adhere to these rules to maintain visual and architectural consistency.

---

## 🎨 Design Direction

The Admin UI uses a high-contrast, premium, dark aesthetic matching the Caro brand.

- **Aesthetics**: Sleek dark mode, sharp borders (no rounded borders except where explicitly noted, such as status indicators or external elements), grid-based layouts, and clean typographic hierarchy.
- **Palette Principle**: High visual contrast. Primary background is absolute dark, surfaces are charcoal, text is off-white (bone), and the brand highlight color (Volt) is reserved for high-priority interactive states or crucial messaging.

---

## 🪙 Token Usage (Colors)

| Token Name | Hex Code  | Intended Usage                                                                                                  | Tailwind Class                        |
| :--------- | :-------- | :-------------------------------------------------------------------------------------------------------------- | :------------------------------------ |
| `void`     | `#0A0A0A` | Primary background, root layout background.                                                                     | `bg-void`                             |
| `charcoal` | `#1C1C1C` | Cards, table headers, sidebar background, secondary panels.                                                     | `bg-charcoal`, `border-charcoal`      |
| `bone`     | `#F8F5F0` | Primary text, titles, headings, and high-visibility elements.                                                   | `text-bone`                           |
| `ash`      | `#B4AFA8` | Secondary/muted text, borders, labels, and placeholders.                                                        | `text-ash`, `border-ash`              |
| `volt`     | `#C8FF00` | Sacred brand highlight. Use **only** for primary CTAs, active states, low-stock signals, and new announcements. | `text-volt`, `bg-volt`, `border-volt` |

---

## 🔤 Typography & Font Roles

Typography must follow the hierarchical roles defined below:

1. **`font-display` (Bebas Neue)**
   - **Usage**: Page titles, primary section headers, major stats.
   - **Style**: Large, uppercase, leading-none.
   - **Example**: `<h1 class="font-display text-6xl text-bone uppercase">Products</h1>`

2. **`font-mono` (Space Mono)**
   - **Usage**: Badges, status pills, table headers, tags, numeric metadata (prices, counts), kickers.
   - **Style**: Small size, letter spacing (tracking-widest), uppercase.
   - **Example**: `<span class="font-mono text-[10px] tracking-widest text-volt uppercase">Catalog</span>`

3. **`font-sans` (DM Sans)**
   - **Usage**: Body text, form field labels, descriptions, select menus, input values.
   - **Style**: Standard weights, highly readable layout-friendly sizes.
   - **Example**: `<p class="font-sans text-sm text-ash">Enter product name here.</p>`

---

## 🔘 Button Variants (`AdminButton`)

All admin buttons must use the `AdminButton` component from `$lib/components/admin/controls/AdminButton.svelte`. Do not build inline button markup unless creating custom components in `$lib/components/admin/**`.

### Variants & Purposes:

- **`volt` (Primary)**: The primary call-to-action (CTA). Reserved for saving changes, creating new records, and confirming actions.
  - _Classes_: `bg-volt text-void hover:bg-bone focus-visible:ring-volt`
- **`charcoal` (Secondary)**: Used for secondary actions, canceling forms, and general actions that are not the main workflow path.
  - _Classes_: `bg-charcoal text-bone hover:bg-ash/20 border border-charcoal hover:border-ash/30 focus-visible:ring-ash`
- **`outline` (Tertiary)**: Used for table controls, toggle filters, or page navigation.
  - _Classes_: `border border-ash/30 bg-void text-bone hover:border-volt hover:text-volt focus-visible:ring-volt`
- **`danger` (Destructive)**: Reserved for deletes, bans, or destructive actions.
  - _Classes_: `border border-red-500/20 text-red-400 hover:border-red-400 hover:text-red-300 hover:bg-red-500/10 focus-visible:ring-red-400`

---

## 🏷 Badge Variants (Status pills)

Badges must represent system/entity status using sharp, bordered, uppercase mono styling:
`border px-1.5 py-0.5 font-mono text-[8px] font-semibold tracking-wider uppercase`

### Status Schema mapping:

- **Active / Valid**: `border-volt/20 bg-volt/10 text-volt` (e.g., Active Users)
- **Suspended / Banned**: `border-red-500/20 bg-red-500/10 text-red-400` (e.g., Banned Users)
- **Sent / Completed**: `border-emerald-500/30 bg-emerald-500/5 text-emerald-400` (e.g., Delivered Notifications)
- **Failed / Critical**: `border-rose-500/30 bg-rose-500/5 text-rose-400` (e.g., Notification Errors)
- **Processing / In Progress**: `border-sky-500/30 bg-sky-500/5 text-sky-400` (e.g., Outbox processing)
- **Pending / Warning**: `border-amber-500/30 bg-amber-500/5 text-amber-400` (e.g., Awaiting sync)
- **Cancelled / Neutral**: `border-charcoal bg-void text-ash/60` (e.g., Cancelled notifications)
- **Metadata / Read-only state**: `border border-ash/20 bg-void/50 text-ash` (e.g., Auth methods, session counts)

---

## 📄 Page Structures

### 1. List Page Structure (`AdminListLayout`)

All collections (users, products, notifications, inventory) must use `AdminListLayout` from `$lib/components/admin/layout/AdminListLayout.svelte`.

- **Kicker**: Declares context (e.g., `Catalog`, `Operations`, `Security`).
- **Header Title**: Clear, large display typography.
- **Header Actions**: Use `AdminActionToolbar` for one primary command, optional tabs, and overflow actions.
- **Stats Row**: Use `AdminStatsGrid` with named metrics, explicit scope, optional descriptions, and semantic tones. Avoid unlabeled or mixed-scope totals.
- **Controls**: Live search input with expandable advanced filters and clear indicators.
- **Table / Card Grid**: Responsive grid displaying tabular entries on desktop and card views on mobile.
- **Pagination**: Previous/Next links with item count summaries.

### 2. Form Page Structure (`AdminFormLayout`)

All detail, creation, and editing pages must use `AdminFormLayout` from `$lib/components/admin/layout/AdminFormLayout.svelte`.

- **Navigation**: Persistent back button labeled with context (e.g., `< Back to Products`).
- **Header**: Large title with current context kicker.
- **Two-Column Grid**:
  - **Main Content (Left)**: Inputs, detail settings, textareas, images, and nested sub-categories.
  - **Sidebar (Right)**: Read-only snapshots, action lists, status overrides, and a pinned submit panel.
- **Progress Bar**: Linear animation (`.animate-progress-bar`) active during network submissions to indicate saving.
- **Unsaved Changes Flow**: Pass Superforms taint and local media/editor state to `AdminUnsavedChangesGuard`. The guard uses `AdminUnsavedChangesModal` for internal navigation and native unload protection for external navigation.

### Responsive Contract

- Validate admin UI at 360px, 430px, 768px, and 1440px.
- Interactive controls are at least 44px high on mobile. Desktop-only compact controls may reduce at `sm` and above.
- `AdminMetaGrid` uses one column at 360px, then expands from 430px. Apply `min-[430px]:col-span-2` to spanning metadata so no implicit column is created on narrow screens.
- List routes render entity cards below the desktop table breakpoint. Wide tables scroll inside their own surface, never at page level.
- `AdminFormLayout` and `AdminDetailLayout` expose sidebar actions or context in a mobile disclosure before the main content and keep the desktop sidebar sticky.
- Drawers and modals keep headers and actions visible while only their body scrolls. Modal action rows stack on narrow screens.
- Query tabs use `AdminTabs`, which owns horizontal overflow and minimum touch targets.
- The mobile command bar is solid `bg-void`: menu trigger left, centered CARO wordmark, and the signed-in account avatar or initials right.
- The desktop profile menu stays anchored above the sidebar profile trigger, closes on outside press or Escape, and must not shift sidebar layout.

---

## 🛡 Architectural Integrity Rules

### Rule 1: Routes Compose, Components Style

SvelteKit route pages (`src/routes/admin/**/+page.svelte` or `src/routes/(protected)/app/**/+page.svelte`) must only act as coordinators.

- **Allowed in Route**: Calling service endpoints, handling Superforms, binding actions, and rendering UI modules/scaffold layouts.
- **Forbidden in Route**: Ownership of raw/primitive Tailwind layouts, custom grids, and style definitions for input elements, buttons, and status indicators. Compose them from the admin component library.

### Rule 2: Wrap Third-Party Libraries (Bit UI)

All Radix/Bit UI primitives (`bits-ui`) must be wrapped inside `src/lib/components/admin/**` (e.g., `AdminButton.svelte`, `AdminSelect.svelte`, `AdminToggle.svelte`).

- **Rule**: SvelteKit routes must never import `bits-ui` directly. They must use the designated admin components. This ensures updates to design standards or underlying primitives can be executed in a single file without refactoring every route.

## Admin Component Inventory & Usage Rules

The admin UI system is now split into reusable layout, primitive, data-display, filter, domain, and sidebar components. Future route refactors and new admin pages must use these components instead of recreating Tailwind-heavy UI inside route files.

Canonical component folders are `categories`, `controls`, `data-display`, `feedback`, `filters`, `forms`, `inventory`, `layout`, `notifications`, `overlays`, `products`, and `sidebar`. Do not add new admin components back to the `src/lib/components/admin` root.

---

## Core Admin Primitives

Use these components for all primitive UI behavior:

| Component             | Purpose                                               |
| :-------------------- | :---------------------------------------------------- |
| `AdminButton`         | All admin buttons and button-like links.              |
| `AdminInput`          | Text, number, email, search, and basic input fields.  |
| `AdminSelect`         | Native select fields with admin styling.              |
| `AdminTextarea`       | Multi-line form fields.                               |
| `AdminCheckbox`       | Checkbox controls and row selection.                  |
| `AdminToggle`         | Boolean form/settings switch.                         |
| `AdminFilterToggle`   | Boolean filter chip/toggle used inside filter panels. |
| `AdminBadge`          | All status, state, and metadata badges.               |
| `AdminCard`           | Generic bordered admin surface.                       |
| `AdminToast`          | Admin feedback/toast messages.                        |
| `AdminDateTimePicker` | Admin date/time input.                                |
| `AdminHexInput`       | Hex/color input.                                      |
| `AdminImageUpload`    | Admin image upload UI.                                |
| `AdminTabs`           | Segmented route or local view navigation.             |

Routes must not recreate these styles manually unless extracting a new reusable admin component.

`AdminSelect` renders a real native `<select>`. Use either its `options` prop or child `<option>` elements. With `options`, it inserts the placeholder only when no empty option exists; with children, the caller owns every option. Submitted values follow native form behavior and arrive as strings, so schemas/services remain responsible for coercion. Use the bound value and `onchange` from the native `HTMLSelectElement`; do not expect Bit UI trigger/content behavior.

---

## Overlay And Form Guard Components

Use the correct overlay component based on interaction type:

| Component                  | Use For                                                                                        | Do Not Use For                                   |
| :------------------------- | :--------------------------------------------------------------------------------------------- | :----------------------------------------------- |
| `AdminDrawer`              | Contextual side-panel details, record previews, metadata inspection, lightweight side actions. | Complex create/edit forms that need a full page. |
| `AdminModal`               | Short focused workflows, small forms, image/slip previews, quick record actions.               | Long multi-section forms.                        |
| `AdminConfirmDialog`       | Confirming destructive or irreversible actions.                                                | General detail display.                          |
| `AdminActionMenu`          | Typed secondary, maintenance, and destructive command menu.                                    | Primary page navigation or the page's main CTA.  |
| `AdminUnsavedChangesModal` | Dirty form navigation protection.                                                              | Normal confirmation dialogs.                     |
| `AdminUnsavedChangesGuard` | Intercepts dirty internal navigation and browser unload, then coordinates the unsaved modal.   | Form validation or submit handling.              |

Rules:

- Route files must not import `bits-ui` directly.
- Bit UI primitives must be wrapped inside `src/lib/components/admin/**`.
- Overlay components live under `admin/overlays`; the unsaved-changes guard and its dedicated modal stay colocated under `admin/forms`.
- Use `AdminDrawer` when the admin should inspect or act on an entity without losing their list/search/filter context.
- Use full pages for complex create/edit/detail workflows.
- Destructive or irreversible actions must expose a loading state and keep failure feedback visible.

---

## Layout Components

Use these components to keep page spacing and hierarchy consistent:

| Component            | Purpose                                                                                                          |
| :------------------- | :--------------------------------------------------------------------------------------------------------------- |
| `AdminPageShell`     | Owns admin page width, padding, and vertical rhythm.                                                             |
| `AdminPageHeader`    | Standard page title, kicker, description, back link, and actions.                                                |
| `AdminListLayout`    | Standard list/index pages with search, filters, stats, table/card layout, pagination, loading, and empty states. |
| `AdminFormLayout`    | Create/edit form pages with main form content and sidebar submit/status panel.                                   |
| `AdminDetailLayout`  | Read-only or operational detail pages for one entity.                                                            |
| `AdminSection`       | Reusable bordered content section inside pages.                                                                  |
| `AdminStatsGrid`     | Standard stat/metric row.                                                                                        |
| `AdminActionToolbar` | Responsive page actions: optional views, one primary CTA, and `AdminActionMenu`.                                 |
| `AdminPagination`    | Standard pagination controls.                                                                                    |
| `AdminSearchBar`     | Standard list search bar.                                                                                        |

Rules:

- Do not create custom page wrappers in route files.
- Do not duplicate `mx-auto`, `max-w-*`, `px-*`, and `py-*` page-level wrappers.
- Page-level spacing belongs to `AdminPageShell`, `AdminListLayout`, `AdminFormLayout`, or `AdminDetailLayout`.
- `AdminStatsGrid` is the canonical page-level metric renderer. Pass explicit `metrics`; the generic `stats` prop is compatibility-only. The grid owns responsive columns for one through six metrics. Use `statsNotice` for an adjacent warning instead of replacing the grid.
- `AdminActionToolbar` owns action spacing and wrapping. Put route/view tabs in `views`, keep at most one Volt CTA in `primary`, and pass remaining commands as typed `menuItems` to `AdminActionMenu`.
- Keep destructive or maintenance commands in the action menu unless they are the page's sole purpose. They still require `AdminConfirmDialog` when confirmation is needed.

---

## Data Display Components

Use these for list rows, cards, entity metadata, and empty/loading states:

| Component           | Purpose                                           |
| :------------------ | :------------------------------------------------ |
| `AdminEmptyState`   | Empty list or empty section display.              |
| `AdminEntityCard`   | Mobile/entity card surface for list items.        |
| `AdminEntityMedia`  | Consistent entity thumbnail/media display.        |
| `AdminIconAction`   | Small icon-only row/card action.                  |
| `AdminMetaGrid`     | Label/value metadata grid.                        |
| `AdminRowActions`   | Grouped table/card row actions.                   |
| `AdminSkeletonList` | Standard list loading skeleton.                   |
| `AdminTableGrid`    | Responsive mobile-card + desktop-table renderer.  |
| `AdminErrorState`   | Recoverable route, stream, or panel load failure. |
| `AdminCopyButton`   | Clipboard action with success and failure state.  |
| `AdminJsonViewer`   | Safe structured JSON inspection and copying.      |

Rules:

- List pages must not duplicate separate custom card/row styling if a data-display component can be used.
- Mobile cards and desktop rows should expose the same core entity information.
- Empty states must use `AdminEmptyState`.
- Loading lists should use `AdminSkeletonList` unless a custom skeleton is clearly required.
- Streamed data must provide `{:catch}` UI with `AdminErrorState`; a loading skeleton alone is incomplete.

---

## Filter Components

Use these for search and advanced filtering:

| Component          | Purpose                              |
| :----------------- | :----------------------------------- |
| `AdminFilterBar`   | Grid wrapper for advanced filters.   |
| `AdminSearchInput` | Search input used by list pages.     |
| `AdminSearchBar`   | Search section used by list layouts. |

Rules:

- Preserve existing query parameter names.
- Set `searchParamName` when a route search uses a parameter other than `query`.
- Use `preserveParams`, `filterLimitParam`, `filterOffsetParam`, and `paginationOffsetParam` for tabbed or independently paginated views.
- Preserve existing auto-submit behavior where already used.
- Advanced filter controls stay mounted while collapsed so their values remain in GET submissions.
- Prefer `AdminInput`, `AdminSelect`, and `AdminFilterToggle` inside filter panels.
- Do not use raw `<input>` or `<select>` in route files unless creating/updating an admin primitive.

---

## Shared Admin Helpers

Use shared helpers instead of duplicating formatting/status logic in route files:

| Helper File                       | Purpose                                               |
| :-------------------------------- | :---------------------------------------------------- |
| `src/lib/shared/admin/format.ts`  | Money, date, date-time, and status label formatting.  |
| `src/lib/shared/admin/status.ts`  | Maps entity/domain statuses to `AdminBadge` variants. |
| `src/lib/shared/admin/options.ts` | Canonical admin payment and domain option lists.      |

Rules:

- Do not duplicate `formatMoney`, `formatDate`, or `statusClass` functions in route files.
- Use `formatAdminMoney`, `formatAdminDate`, `formatAdminDateTime`, and `formatAdminStatus` where appropriate.
- Use status helper functions before adding new badge variant logic.

---

## Product Domain Components

Product create/edit pages should compose product-specific UI from:

| Component                  | Purpose                                                                |
| :------------------------- | :--------------------------------------------------------------------- |
| `ProductBasicsSection`     | Product title, slug, description, category, and basic identity fields. |
| `ProductVariantsSection`   | Variant options, pricing, sizes, and color-scoped product media.       |
| `ProductTagsSection`       | Product tag selection/creation UI.                                     |
| `ProductPublishingSection` | Active/draft/publish controls and visibility settings.                 |
| `ProductPreviewPanel`      | Read-only product snapshot/sidebar preview.                            |
| `ProductColorSelector`     | Product color selection and related color UI.                          |

Rules:

- Product route files should own data loading, Superforms setup, submit wiring, and high-level composition.
- Product route files should not contain large inline product section markup.
- Do not change product form schemas, server actions, variant client IDs, or image metadata semantics during UI refactors.
- Product colors use `ProductColorSelector`, not `AdminSelect`: each option shows its swatch, name, and hex value; colors already assigned to another variant are disabled; selecting a color updates `colorId`, `color`, and `colorHex` together.
- Only valid six-digit hex values render a swatch. New colors open the existing color-creation modal and must re-enter the selector through the same synchronized color fields.

---

## Sidebar Components

The sidebar system is split into:

| Component/File              | Purpose                                  |
| :-------------------------- | :--------------------------------------- |
| `AdminSidebar`              | Main shell-level sidebar wrapper.        |
| `sidebar/admin-nav.ts`      | Navigation groups and route definitions. |
| `AdminSidebarNav`           | Renders grouped admin navigation.        |
| `AdminSidebarProfile`       | Desktop profile/account section.         |
| `AdminSidebarMobileProfile` | Mobile profile/account section.          |
| `AdminMobileCommandBar`     | Mobile app command/header bar.           |

Rules:

- Do not duplicate nav config outside `admin-nav.ts`.
- Keep route highlighting consistent.
- Keep desktop collapsed sidebar and mobile drawer behavior intact.
- Keep `AdminMobileCommandBar` solid black and preserve the account avatar/initials link on its right edge.
- Keep `AdminSidebarProfile` mounted in stable sidebar flow; its menu overlays above the trigger and closes on outside press or Escape.

---

## Refactoring Existing Admin Pages

When refactoring an old page under `src/routes/(protected)/app/**`, follow this workflow:

1. Read the current page and its matching `+page.server.ts`.
2. Identify the page type:
   - list/index page
   - create/edit form page
   - detail page
   - operational/action page

3. Preserve all load data shapes, form actions, query parameters, and server behavior.
4. Replace raw UI patterns with admin system components.
5. Remove duplicated formatting/status helpers and use shared helpers.
6. Remove direct `bits-ui` imports from route files.
7. Replace inline badges with `AdminBadge`.
8. Replace raw empty states with `AdminEmptyState`.
9. Replace repeated row/card action markup with `AdminRowActions`, `AdminIconAction`, or `AdminActionMenu`; use `AdminActionToolbar` for page headers.
10. Replace repeated metadata blocks with `AdminMetaGrid`.
11. Replace raw filter layouts with `AdminFilterBar` and admin input/select primitives.
12. Keep one route/page refactor per task unless explicitly asked otherwise.
13. Run validation after each page.

Validation:

```bash
pnpm check
```

Run this after larger refactors:

```bash
pnpm lint
```

---

## Creating New Admin Pages

When creating a new admin page, choose the correct structure:

### Use `AdminListLayout` when:

- The page displays a collection of records.
- It needs search, filters, stats, pagination, loading, empty state, mobile cards, or desktop table rows.

Required list page parts:

- `tableHeaders`
- `items`
- explicit `metrics` where meaningful
- `advancedFilters` snippet where filters exist
- `row` snippet for desktop
- `card` snippet for mobile
- `emptyState` snippet using `AdminEmptyState`
- shared formatting/status helpers

### Use `AdminFormLayout` when:

- The page creates or edits a record.
- It contains a form with multiple sections.
- It needs save/cancel actions, dirty-state protection, or a submit sidebar.

Required form page parts:

- back link
- page header
- main form sections using `AdminSection`
- sidebar summary/actions
- `AdminUnsavedChangesGuard` where dirty navigation protection is required
- `AdminButton` for submit/cancel actions

### Use `AdminDetailLayout` when:

- The page shows one record in detail.
- The page is mostly read-only.
- The page may include related records, status history, metadata, or operational actions.

### Use `AdminDrawer` when:

- The admin should inspect a record from a list without leaving the list page.
- The content is contextual, secondary, or read-only.
- The action should preserve the user’s current search/filter/pagination state.
- The Users list exposes one `Manage` command per row/card. Its drawer separates overview, credentials/access, sessions, and account operations with `AdminTabs`; do not restore parallel row action menus.

### Use `AdminModal` when:

- The workflow is short and focused.
- The action is temporary or interruptive.
- The content does not need a full page.

### Use `AdminConfirmDialog` when:

- The user must confirm a destructive or irreversible action.

---

## Task 13 Page Refactor Rule

Task 13 must be performed one admin route at a time.

Refactor both top-level pages and nested admin subroutes under:

```txt
src/routes/(protected)/app
```

Do not skip product, category, order, or operational subroutes. Nested routes often contain older page patterns and should follow the same admin UI system rules.

Recommended refactor order:

1. `products`
   - `src/routes/(protected)/app/products/+page.svelte`
   - `src/routes/(protected)/app/products/new/+page.svelte`
   - `src/routes/(protected)/app/products/[productslug]/+page.svelte`
   - `src/routes/(protected)/app/products/[productslug]/edit/+page.svelte`

2. `categories`
   - `src/routes/(protected)/app/categories/+page.svelte`
   - `src/routes/(protected)/app/categories/new/+page.svelte`
   - `src/routes/(protected)/app/categories/[categoryslug]/+page.svelte`
   - `src/routes/(protected)/app/categories/[categoryslug]/edit/+page.svelte`

3. `orders`
   - `src/routes/(protected)/app/orders/+page.svelte`
   - `src/routes/(protected)/app/orders/[orderId]/+page.svelte`
   - `src/routes/(protected)/app/orders/print/+page.svelte`
   - Do not refactor `orders/export/+server.ts` as UI work unless required by route behavior.

4. `payments`
   - `src/routes/(protected)/app/payments/+page.svelte`

5. `inventory`
   - `src/routes/(protected)/app/inventory/+page.svelte`

6. `users`
   - `src/routes/(protected)/app/users/+page.svelte`

7. `addresses`
   - `src/routes/(protected)/app/addresses/+page.svelte`

8. `promotions`
   - `src/routes/(protected)/app/promotions/+page.svelte`

9. `reviews`
   - `src/routes/(protected)/app/reviews/+page.svelte`

10. `notifications`

- `src/routes/(protected)/app/notifications/+page.svelte`

11. `shipping`

- `src/routes/(protected)/app/shipping/+page.svelte`

12. `bag`

- `src/routes/(protected)/app/bag/+page.svelte`

13. `wishlist`

- `src/routes/(protected)/app/wishlist/+page.svelte`

14. Admin dashboard

- `src/routes/(protected)/app/+page.svelte`

15. Admin shell/layout final pass

- `src/routes/(protected)/app/+layout.svelte`
- `src/lib/components/admin/sidebar/AdminSidebar.svelte`
- `src/lib/components/admin/layout/AdminMobileCommandBar.svelte`
- Sidebar subcomponents under `src/lib/components/admin/sidebar/**`

For each route:

- Refactor only the selected route and directly required reusable components.
- Always inspect the matching `+page.server.ts` before editing the route page.
- Preserve all server behavior.
- Preserve query params.
- Preserve form actions.
- Preserve Superforms behavior.
- Preserve links and route URLs.
- Preserve loaded data shapes.
- Replace old visual patterns with admin system components.
- Do not introduce a new visual design.
- Do not refactor unrelated routes in the same pass.
- Run `pnpm check` before finishing.
- Run `pnpm lint` if many files changed.

Nested route rules:

- Use `AdminListLayout` for collection/index pages.
- Use `AdminFormLayout` for create/edit pages.
- Use `AdminDetailLayout` for read-only entity detail pages.
- Use `AdminDrawer` for contextual side-panel inspection from a list.
- Use `AdminModal` for short focused actions.
- Use `AdminConfirmDialog` for destructive confirmations.
- Product create/edit routes should use the product domain components under `src/lib/components/admin/products/**`.
- Category create/edit routes should use shared admin form/layout primitives. Create category-domain components only if duplication appears across `new` and `edit`.
- Order detail/print routes should preserve operational behavior and avoid changing printable/export behavior unless explicitly requested.

---

## Route Rules

The admin route root is:

```txt
src/routes/(protected)/app
```

Do not use or create `src/routes/admin/**` unless the routing architecture is intentionally changed.

Routes should coordinate data and composition. Components should own visual structure.
