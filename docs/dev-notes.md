# Dev Notes (Reference & Best Practices)

### 1. Syncing Server Page Data inside `$effect` (Svelte 5)

- **DON'T DO THIS**: Do not call store setters (`bag.setBag()`, `wishlist.setProductIds()`) directly inside `$effect` without untracking. Svelte 5 automatically tracks reactive `$state` reads inside store setters, triggering a circular re-execution loop (`effect_update_depth_exceeded`).
- **INSTEAD DO THIS**: Wrap store initialization and sync calls inside `untrack(() => { ... })` from `'svelte'`.

---

### 2. Debouncing Optimistic UI Mutations

- **DON'T DO THIS**: Do not increment mutation counters (`pendingMutations++`) inside component event handlers before debouncing. Rapid clicks clear intermediate timers via `clearTimeout()` without calling `endMutation()`, permanently leaking `pendingMutations > 0` and blocking future store updates.
- **INSTEAD DO THIS**: Centralize mutation lifecycles inside `BagState` (`bag.svelte.ts`). Track per-item timers in an `itemDebounceTimers` Map; rapid clicks clear existing timers without re-incrementing `pendingMutations`, keeping sequence tracking strictly 1:1.

---

### 3. Optimistic Updates & Background Polling Overwrites

- **DON'T DO THIS**: Do not overwrite client optimistic state with unversioned API responses or background polling (`bag.refresh()`) while user edits are pending.
- **INSTEAD DO THIS**: Track `mutationVersion` in `BagState`. Ignore server responses with `version < mutationVersion`, and block background `refresh()` calls while `pendingMutations > 0`.

---

### 4. Progress Bars & Dynamic List Performance

- **DON'T DO THIS**: Do not wrap list items in `{#key}` blocks tied to volatile properties (forces DOM unmounting/remounting on every state update), and do not animate layout-thrashing CSS properties like `width`.
- **INSTEAD DO THIS**: Remove `{#key}` wrappers so Svelte updates component props in-place, and use GPU compositor-accelerated `transform: scaleX(...)` (`origin-left`, `will-change-transform`).

---

### 5. Multi-View UI Logic (Drawer vs Standalone Page)

- **DON'T DO THIS**: Do not duplicate `fetch()` calls, local state, or HTML markup across page and drawer components.
- **INSTEAD DO THIS**: Move API methods (`applyPromo`, `removePromo`) into `BagState`, and extract shared UI into reusable presentational components (`FreeShippingBar.svelte`, `PromoCodeInput.svelte`, `EmptyBag.svelte`).

---

### 6. Non-Rendered Comparison State in Reactive Effects

- **DON'T DO THIS**: Do not wrap internal comparison tracking variables in reactive state (`$state()`) if they are read in a condition check and mutated at the end of the same effect block. Reading and writing reactive state inside the same effect creates self-referential dependencies, triggering infinite update loops (`effect_update_depth_exceeded`).
- **INSTEAD DO THIS**: Use plain non-reactive JavaScript variables (`let prevValue = 0`) for internal state tracking that is not directly rendered in the UI template.

---

### 7. Derived Signals vs Local Mutable State Synchronization

- **DON'T DO THIS**: Do not attempt to reassign or mutate read-only derived signals (`$derived(...)`) in response to client callbacks or live updates.
- **INSTEAD DO THIS**: Declare local mutable state with `$state()` and keep it in sync with reactive server props via an explicit `$effect(() => { localState = propValue; })`.

---

### 8. Conditional DTO Hydration for Qualified Entitlements

- **DON'T DO THIS**: Do not blindly pass raw database foreign keys into hydrated DTOs when associated business qualifications or domain rules fail. Returning active identifiers alongside zeroed-out calculated values creates misleading state in client consumers.
- **INSTEAD DO THIS**: Compute effective entitlement identifiers during service hydration that resolve to `null` whenever domain qualification checks fail, keeping all DTO fields strictly consistent.

---

### 9. API Route Logging & Error Handling Boundaries

- **DON'T DO THIS**: Do not execute `console.error(...)` unconditionally in API route `catch` blocks for expected client-facing domain validation errors (4xx status codes). Unfiltered logging creates stack trace noise for normal user validation outcomes.
- **INSTEAD DO THIS**: Filter route logging with `if (!isAppError(error) || error.statusCode >= 500)` before invoking `console.error`, allowing standard domain errors to be handled cleanly by route error adapters.

---

### 10. Automated Observability PII Redaction

- **DON'T DO THIS**: Do not allow raw customer personally identifiable information (phone numbers, email addresses, authentication tokens, or OTP secrets) to be included in telemetry events, breadcrumbs, or error monitoring payloads.
- **INSTEAD DO THIS**: Enforce automated regex sanitization in telemetry dispatch hooks (`beforeSend`), redacting sensitive PII patterns (`[REDACTED_PII]`) from URLs, breadcrumb text, and user metadata before event dispatch.

---

### 11. Structured Module Namespace Tagging in Diagnostics

- **DON'T DO THIS**: Do not emit un-prefixed or inconsistently formatted log messages in error catch blocks across client stores, server services, and route handlers. Un-tagged logging creates fragmented output that is difficult to search or filter in worker logs.
- **INSTEAD DO THIS**: Prefix all diagnostic log calls with standardized bracketed module tags (`[bag]`, `[wishlist]`, `[orders]`, `[promotions]`, `[checkout]`, `[admin:users]`) corresponding to the owning feature or domain boundary.

---

### 12. Recording Non-Fatal Domain Validation Breadcrumbs

- **DON'T DO THIS**: Do not completely discard diagnostic context when handling expected 4xx domain validation failures. Omitting validation history leaves developers blind to the sequence of user actions preceding a subsequent system error or bug report.
- **INSTEAD DO THIS**: Record low-overhead warning breadcrumbs (`Sentry.addBreadcrumb({ category: 'domain.validation', level: 'warning' })`) inside route error adapters during 4xx handling, maintaining diagnostic history without generating exception alert noise.

---

### 13. Async Action Loading & Input Preservation in Reusable Components

- **DON'T DO THIS**: Do not clear user inputs before async API calls finish or when validation fails, and do not leave action buttons enabled without visual loading feedback during server calls.
- **INSTEAD DO THIS**: Expose explicit loading flags (`isApplyingPromo`, `isRemovingPromo`) in client domain store (`bag.svelte.ts`). In shared UI components (`PromoCodeInput.svelte`), disable inputs while active, display animated progress text (`VALIDATING...` / `REMOVING...`), and clear input value ONLY on success so failed inputs stay editable.

---

### 14. CSS Grid Stacking for Concurrent Branch Transitions

- **DON'T DO THIS**: Do not place height or slide transitions (`transition:slide`) on competing `{#if}` and `{:else}` branch elements in standard document flow. Concurrent rendering during the transition window causes vertical stacking and layout jitter for elements below.
- **INSTEAD DO THIS**: Wrap conditional transition branches in a single CSS Grid container (`grid grid-cols-1 grid-rows-1 overflow-hidden`) and place each branch in the identical grid cell (`col-start-1 row-start-1`), allowing entering and exiting elements to animate in-place without disturbing surrounding page layout.

---

### 15. Zero-Delay Optimistic State Derivation for Threshold Entitlements

- **DON'T DO THIS**: Do not gate client active states or monetary calculations on server-populated database keys or status flags during local optimistic mutations. Waiting for API responses introduces network latency delays before visual indicators, badges, and totals update.
- **INSTEAD DO THIS**: Retain active rule metadata locally and derive entitlement eligibility dynamically from client reactive signals (e.g. `subtotal >= minThreshold`). Derive effective discount and summary values at 0ms synchronously with user actions, letting background server responses validate without UI flicker.

---

### 16. Standardized Domain Error Messages with Requirement Context

- **DON'T DO THIS**: Do not return generic error strings (such as `"Minimum order value not met."` or `"Invalid code."`) from domain services or display different error text on the client for the same failure condition. Generic error text frustrates users and creates inconsistency between client-derived notices and server API responses.
- **INSTEAD DO THIS**: Include specific entity identifiers and requirement details directly in domain error messages (e.g. `Promo ${code} requires min. LKR ${minOrderAmount.toLocaleString()}`). Ensure client components use identical wording for matching failure conditions.

---

### 17. Separate Payment Attempts from Orders

- **DON'T DO THIS**: Do not create a pending order, transfer inventory reservations, or delete the bag before an online provider has verified payment. Provider setup, cancellation, or failure must never leave a customer with a phantom order or held stock.
- **INSTEAD DO THIS**: Persist one short-lived pending `payment_attempt` per bag containing the validated checkout intent. Resume identical setup retries, reject conflicting details until the attempt expires, and update terminal states monotonically. Reject PayPal capture before the provider call when the checkout has already expired. On signed PayHere success or verified PayPal capture, revalidate the live bag and create the confirmed order/payment, inventory sale, bag deletion, and confirmation outbox rows in one transaction. If finalization fails after provider capture, retain no partial order and mark the attempt `review_required` for support.
