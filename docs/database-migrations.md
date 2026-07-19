# Database Migrations

- **Migration directory:** `drizzle/`
- **Schema source:** `src/lib/server/db/schema.ts`
- **Configuration:** `drizzle.config.ts`

## Workflow

1. Edit the owning `*.drizzle.ts` schema.
2. Run `pnpm db:generate --name <change_name>`.
3. Review the generated SQL and snapshot diff.
4. Run the affected service tests and `pnpm check`.
5. Apply reviewed migrations with `pnpm db:migrate` in the target environment.

Do not use `db:push` as the deployment path for shared staging or production databases. It does not provide the versioned, reviewable rollout history required for schema constraints and data migrations.

## Baseline Transition

`0000_baseline.sql` is the complete schema baseline for new databases. A new empty database can run the migration chain from `0000` onward.

Databases that existed before migration tracking was introduced on 2026-07-19 must not execute `0000_baseline.sql` against their populated schema. Back up the database, verify it matches the `0000` snapshot, register `0000_baseline` as the deployment baseline using the environment's Drizzle/libSQL migration procedure, and then apply `0001_payment_attempt_integrity.sql` normally.

`0001_payment_attempt_integrity.sql` resolves legacy duplicate pending attempts by keeping the newest pending attempt per bag, cancelling older rows, and then creating the partial unique index. A cancelled provider session may still report a late capture; payment finalization treats that as support-review state rather than creating a second order.

`0002_preserve_inventory_audit.sql` rebuilds `inventory_movement` with a restrictive variant foreign key. Product, variant-color, and size-variant deletion services also reject records with inventory or review history, so append-only movements and review-owned media cannot disappear through catalog cascades. Deactivate historical catalog records instead.

`0003_wishlist_variant_integrity.sql` rebuilds `wishlist_item` so deleting a selected variant deletes only its variant-specific wishlist rows. It no longer converts them to product-only rows, which could violate the product-only partial unique index when the shopper had saved both targets.
