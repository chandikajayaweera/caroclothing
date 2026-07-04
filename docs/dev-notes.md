# Dev Notes (Reference & Best Practices)

### 1. Syncing Server Page Data inside `$effect` (Svelte 5)
* **DON'T DO THIS**: Do not call store setters (`bag.setBag()`, `wishlist.setProductIds()`) directly inside `$effect` without untracking. Svelte 5 automatically tracks reactive `$state` reads inside store setters, triggering a circular re-execution loop (`effect_update_depth_exceeded`).
* **INSTEAD DO THIS**: Wrap store initialization and sync calls inside `untrack(() => { ... })` from `'svelte'`.

---

### 2. Debouncing Optimistic UI Mutations
* **DON'T DO THIS**: Do not increment mutation counters (`pendingMutations++`) inside component event handlers before debouncing. Rapid clicks clear intermediate timers via `clearTimeout()` without calling `endMutation()`, permanently leaking `pendingMutations > 0` and blocking future store updates.
* **INSTEAD DO THIS**: Centralize mutation lifecycles inside `BagState` (`bag.svelte.ts`). Track per-item timers in an `itemDebounceTimers` Map; rapid clicks clear existing timers without re-incrementing `pendingMutations`, keeping sequence tracking strictly 1:1.

---

### 3. Optimistic Updates & Background Polling Overwrites
* **DON'T DO THIS**: Do not overwrite client optimistic state with unversioned API responses or background polling (`bag.refresh()`) while user edits are pending.
* **INSTEAD DO THIS**: Track `mutationVersion` in `BagState`. Ignore server responses with `version < mutationVersion`, and block background `refresh()` calls while `pendingMutations > 0`.

---

### 4. Progress Bars & Dynamic List Performance
* **DON'T DO THIS**: Do not wrap list items in `{#key}` blocks tied to volatile properties (forces DOM unmounting/remounting on every state update), and do not animate layout-thrashing CSS properties like `width`.
* **INSTEAD DO THIS**: Remove `{#key}` wrappers so Svelte updates component props in-place, and use GPU compositor-accelerated `transform: scaleX(...)` (`origin-left`, `will-change-transform`).

---

### 5. Multi-View UI Logic (Drawer vs Standalone Page)
* **DON'T DO THIS**: Do not duplicate `fetch()` calls, local state, or HTML markup across page and drawer components.
* **INSTEAD DO THIS**: Move API methods (`applyPromo`, `removePromo`) into `BagState`, and extract shared UI into reusable presentational components (`FreeShippingBar.svelte`, `PromoCodeInput.svelte`, `EmptyBag.svelte`).

---

### 6. Non-Rendered Comparison State in Reactive Effects
* **DON'T DO THIS**: Do not wrap internal comparison tracking variables in reactive state (`$state()`) if they are read in a condition check and mutated at the end of the same effect block. Reading and writing reactive state inside the same effect creates self-referential dependencies, triggering infinite update loops (`effect_update_depth_exceeded`).
* **INSTEAD DO THIS**: Use plain non-reactive JavaScript variables (`let prevValue = 0`) for internal state tracking that is not directly rendered in the UI template.

---

### 7. Derived Signals vs Local Mutable State Synchronization
* **DON'T DO THIS**: Do not attempt to reassign or mutate read-only derived signals (`$derived(...)`) in response to client callbacks or live updates.
* **INSTEAD DO THIS**: Declare local mutable state with `$state()` and keep it in sync with reactive server props via an explicit `$effect(() => { localState = propValue; })`.

---

### 8. Conditional DTO Hydration for Qualified Entitlements
* **DON'T DO THIS**: Do not blindly pass raw database foreign keys into hydrated DTOs when associated business qualifications or domain rules fail. Returning active identifiers alongside zeroed-out calculated values creates misleading state in client consumers.
* **INSTEAD DO THIS**: Compute effective entitlement identifiers during service hydration that resolve to `null` whenever domain qualification checks fail, keeping all DTO fields strictly consistent.

---

### 9. API Route Logging & Error Handling Boundaries
* **DON'T DO THIS**: Do not execute `console.error(...)` unconditionally in API route `catch` blocks for expected client-facing domain validation errors (4xx status codes). Unfiltered logging creates stack trace noise for normal user validation outcomes.
* **INSTEAD DO THIS**: Filter route logging with `if (!isAppError(error) || error.statusCode >= 500)` before invoking `console.error`, allowing standard domain errors to be handled cleanly by route error adapters.


