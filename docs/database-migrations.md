# Database Migrations

- **Runtime database:** Cloudflare D1 through the `DB` Worker binding
- **Migration directory:** `drizzle-d1/`
- **Schema source:** `src/lib/server/db/schema.ts`
- **Drizzle configuration:** `drizzle.config.ts`
- **Wrangler configuration:** `wrangler.jsonc`

Cloudflare D1 is the application's only database runtime. Database access must
come from the environment-specific `DB` binding; do not add URL/token database
clients or a parallel database transport.

## Normal Workflow

1. Edit the owning `*.drizzle.ts` schema.
2. Run `pnpm db:generate --name <change_name>`.
3. Review the generated SQL and Drizzle snapshot under `drizzle-d1/`.
4. Apply pending migrations locally with `pnpm db:migrate`.
5. Run affected D1 integration tests, `pnpm check:server`, and `pnpm check`.
6. Apply the reviewed migration to staging with `pnpm db:migrate:staging`.
7. Validate staging before applying it with `pnpm db:migrate:production`.

Do not use schema push commands for shared staging or production databases. Do
not execute remote migrations by binding name in ad hoc commands; use the
environment-specific package scripts and explicit database names to reduce the
chance of targeting the wrong database.

## Baseline

`0000_swift_overlord.sql` is the complete schema for a new empty D1 database.
`0001_legal_violations.sql` adds `_d1_batch_guard`, the internal CHECK constraint
table used to make conditional multi-table D1 batches fail and roll back
atomically.

Apply the complete migration chain to every new environment before deploying the
Worker. Never edit an already-applied migration. Generate a new migration for
every later schema change and review its SQL before applying it remotely.

## Environment Commands

```powershell
# Local D1
pnpm db:migrate

# Staging D1
pnpm db:migrate:staging

# Production D1, only after staging validation
pnpm db:migrate:production
```

After remote migrations, confirm that no migrations remain pending and run
`PRAGMA foreign_key_check` before deployment. Production deployment should use
the same reviewed Worker build that passed staging smoke tests.
