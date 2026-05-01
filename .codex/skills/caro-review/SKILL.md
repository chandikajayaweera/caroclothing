---
name: caro-review
description: Use when reviewing a diff for CaroClothing architecture compliance, service-layer correctness, hallucinated imports, missing transactions, and unsafe route logic.
---

# Caro architecture review checklist

Review only unless explicitly asked to edit.

Check:

- No direct `db` imports in `src/routes/**`.
- No Drizzle table imports in `src/routes/**`.
- No Drizzle query helper imports in `src/routes/**`.
- No R2 primitive imports in routes.
- No `$lib/client/*` imports inside `src/lib/server/**`.
- Service functions enforce access control for privileged operations.
- Expected business errors use existing `AppError`, `ErrorCode`, and domain error classes.
- Multi-table writes use transactions.
- Inventory writes create movement rows.
- Cart writes respect exclusive owner and upsert behavior.
- Promo usage updates are atomic.
- R2 upload/update/delete flows have compensation cleanup.
- Form schemas are separate from DB schemas when files or UI-only fields exist.
- Validation commands were run.
- No tests were weakened or removed to pass validation.

Output:

1. Pass/fail summary
2. Violations
3. Risk level
4. Required fixes
5. Optional improvements
