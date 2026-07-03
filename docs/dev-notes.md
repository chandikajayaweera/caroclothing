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

### 6. Historical Comparison Tracking in `$effect` (Svelte 5)
* **DON'T DO THIS**: Do not declare comparison tracking variables (e.g. `prevCount`) with `$state()` if they are read in the condition check and mutated at the end of the same `$effect` (`prevCount = count`). In Svelte 5, reading and writing a `$state` variable inside the same effect registers a self-referential dependency, triggering an infinite update loop (`effect_update_depth_exceeded`).
* **INSTEAD DO THIS**: Use a plain, non-reactive JavaScript variable (`let prevCount = 0;`) for internal effect tracking that is not directly rendered in the UI markup.

---

### 7. Mutating `$derived` Signals vs Mutable State Sync (Svelte 5)
* **DON'T DO THIS**: Do not reassign or mutate `$derived(...)` signals in response to user interactions or polling callbacks (e.g. `availability = [...]`). In Svelte 5, `$derived` expressions produce read-only signals and reassigning them causes runtime errors or proxy mismatches.
* **INSTEAD DO THIS**: Declare local mutable state with `$state<T[]>()` and sync initial/server prop updates using `$effect(() => { availability = data.availability; })`.

