# Codex Service-Layer Workflow Guide

**Audience:** Codex agents and humans using Codex to build CaroClothing services  
**Status:** current as of 2026-05-09
**Scope:** Codex prompts, skills, custom agents, planning stages, and validation for service-layer work

## Current Codebase State

Use the codebase as source of truth before planning.

Project Codex files currently live under:

```txt
.codex/skills
.codex/agents
```

Do not relocate them to `.agents/skills` in this repo unless the user explicitly requests a discovery-path migration.

```txt
Implemented services:
- auth
- addresses
- products
- drops
- wishlist
- cart
- shipping
- promotions
- orders
- reviews

Implemented internal service helpers:
- inventory
  - `inventory.service.ts` exists for transaction helpers used by cart/order-style workflows;
  - `src/lib/server/modules/inventory/index.ts` intentionally exports schema/types only.

Schema-only modules needing services:
- none in the current core service rollout

Implemented service foundations:
- src/lib/server/modules/service-context.ts
- src/lib/server/modules/auth/guards.ts
- src/lib/server/modules/service-utils.ts

Notification status:
- sendDropLaunchEmail exists.
- sendDropLaunchSms exists and is exported.
- notification_outbox is implemented as the durable source of truth for async notification state.
- Cloudflare Queue producer/consumer bindings, Cron retry/reconciliation, and Dead Letter Queue configuration are implemented for notification orchestration.
- Dedicated Queue and Cron orchestration modules route Cloudflare `queue` and `scheduled` handlers to service-layer functions.
```

Ignore `docs/caro_brand_identity.html` and `docs/caro_marketing_strategy.html` unless the user explicitly asks for them.

## Workflow Stages

### 1. Orient

Use this when starting a service module, route refactor, notification workflow, or architecture review.

- Use skill: `$caro-service-layer`
- Optional agent if the user explicitly asks for subagents: `schema-cartographer`
- Read `docs/service-layer-architecture.md`, this guide, the target `*.drizzle.ts`, and relevant helper modules.
- Output files inspected, business invariants, schema comments, relationship risks, and current code gaps.

Starter prompt:

```txt
$caro-service-layer
Plan the <module> service layer. First inspect the schema and helper modules. Do not edit yet. Return business invariants, required service APIs, transaction boundaries, R2/notification needs, access-control rules, and validation commands.
```

### 2. Curate Service APIs

Use this before implementation. The goal is to decide what services should expose based on storefront, admin dashboard, checkout, Queue/Cron/jobs, notifications, and support workflows.

- Use skill: `$caro-service-api-planner`
- Optional agent: `service-api-curator`
- Do not create generic CRUD for internal/audit/junction tables.
- Prefer business workflow APIs over table wrappers.
- Mark any planned helper that does not exist instead of importing it.

API plan must include:

- public/storefront reads
- customer/account actions
- admin dashboard actions
- Queue/Cron/job helpers
- notification outbox/list/mark helpers
- DTOs and derived fields
- cross-module dependencies
- explicit non-goals

Starter prompt:

```txt
$caro-service-api-planner
Create a service API plan for <module>. Consider storefront, admin dashboard, checkout/account, Queue/Cron/jobs, and related modules. Use current schemas and existing helper modules only. End with exact APIs to implement and what not to expose.
```

### 3. Design Implementation

Use this after the API plan is accepted.

- Use skill: `$caro-service-layer`
- Optional agent: `service-architect`
- Define transaction strategy before coding.
- Define R2 compensation before coding.
- Define notification boundary before coding.
- Define error and access-control strategy before coding.

Implementation plan must be decision-complete:

```txt
Files to edit
Public service APIs
Internal Tx helper APIs
DTO mapping
Validation/parsing source
Authorization checks
Transaction boundaries
R2 compensation flow
Notification boundary
Outbox enqueue and idempotency strategy, if any
Test/validation commands
Known risks
```

### 4. Build

Use this only after planning is clear.

- Use skill: `$caro-service-layer`
- Optional agent: `service-builder`
- Keep edits scoped to the module and necessary foundations.
- Do not change schema behavior unless explicitly requested.
- Use existing `AppError`, `ErrorCode`, and domain errors.
- Use `getEnv()` for server app config/provider secrets.
- Use object-parameter APIs for services.
- Keep DTO mapping inside services.

For notifications:

- Use skill: `$caro-notifications`
- Optional agent: `notification-orchestrator`
- DB notification_outbox is the durable source of truth for async notification state.
- Domain services enqueue outbox intent inside the same DB transaction as the business change.
- Queue messages carry only outboxId/idempotencyKey, never full payloads or PII.
- Cloudflare Queue consumers/Cron jobs send email/SMS and mark records sent only after successful sends.
- Cloudflare Cron must recover pending, due failed, and stale locked outbox rows.
- Cloudflare DLQ is for operational review only; DB outbox remains durable audit/retry state.
- Use exported `sendDropLaunchSms` for drop launch SMS workflows.

### 5. Integrate Routes

Use this after a service exists.

- Use skill: `$caro-route-refactor`
- Optional agent: `svelte-integrator`
- Routes must import service functions and form schemas only.
- Business routes must not import db, Drizzle tables, Drizzle query helpers, or R2 primitives.
- Exception: `src/routes/media/[...key]/+server.ts` may use media R2 helpers because it serves media objects.
- If `errors/route-adapter.ts` is still missing, plan/add it before relying on it.

Current known route debt:

```txt
No known business route direct-DB imports after the account route refactor.
```

### 6. Review

Use this after code changes or before merge.

- Use skill: `$caro-review`
- Optional agent: `test-reviewer`
- Review architecture, behavior, notification boundaries, route imports, missing tests, and docs drift.
- If docs and code disagree, either update docs or stop before coding.

Review prompt:

```txt
$caro-review
Review the current diff for Caro service-layer architecture compliance. Focus on route boundaries, transactions, R2 compensation, AppError usage, access control, notification boundaries, tests, and docs drift.
```

## Recommended Subagent Workflow

Only spawn subagents when the user explicitly asks for them.

```txt
1. schema-cartographer reads schema comments and relations.
2. service-api-curator proposes service APIs from storefront/admin/cron needs.
3. service-architect turns accepted APIs into an implementation plan.
4. service-builder implements the approved module.
5. notification-orchestrator handles email/SMS, outbox, Queue, DLQ, or Cron notification plans.
6. svelte-integrator refactors routes after services exist.
7. test-reviewer reviews the diff before final summary.
```

Use read-only agents for exploration/review. Use `service-builder` only for implementation.

## Validation Commands

Run the smallest relevant set first, then broader checks when risk is high.

```powershell
pnpm check
pnpm lint
rg -n '\$lib/server/db|drizzle-orm|\.drizzle|media/r2' src/routes
rg -n '\$lib/client' src/lib/server
```

Also run a targeted stale-contradiction search for old schema-only service status, DLQ/KV-as-source-of-truth wording, and any instruction to put full notification payloads in Queue messages.

Expected current findings:

```txt
src/routes/media/[...key]/+server.ts is the allowed media R2 route exception.
src/lib/server/modules/queue routes Cloudflare Queue batches by queue name.
src/lib/server/modules/cron/scheduled-jobs.ts routes configured Cloudflare cron expressions to current service-layer APIs.
notification_outbox, Cloudflare Queue bindings, Queue handlers, and notification Cron recovery are implemented.
```

## Codex Sources

This workflow follows current OpenAI Codex guidance:

- `AGENTS.md` is durable repo guidance loaded before work: https://developers.openai.com/codex/guides/agents-md
- Skills package reusable workflows and use concise descriptions for triggering: https://developers.openai.com/codex/skills
- Custom agents live under `.codex/agents` or user agent folders and need `name`, `description`, and `developer_instructions`: https://developers.openai.com/codex/subagents
- Good Codex prompts include goal, context, constraints, and done-when criteria: https://developers.openai.com/codex/learn/best-practices
