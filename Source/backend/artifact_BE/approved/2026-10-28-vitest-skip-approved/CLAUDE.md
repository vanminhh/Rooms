# Backend (NestJS 12 + Prisma 6)

Spec: `docs/spec/01-architecture.md` (API conventions, error codes, cron), `02-database.md`, and the module file for your task.

## Layout

```
prisma/            schema.prisma, migrations/, seed.ts   (phase 1: move from docs/database/)
src/
  main.ts          global prefix /api/v1, validation pipe, error filter, cookie parser
  common/          guards (auth, roles, building scope), error filter, crypto (argon2, AES-GCM), date utils (Asia/Ho_Chi_Minh, period math)
  modules/<name>/  <name>.module.ts, .controller.ts, .service.ts, dto/, <name>.spec.ts, feature_<feature>.md (task list)
  jobs/            cron jobs (idempotent)
artifact_BE/       staging area: every new/changed backend file is drafted here and approved first (root CLAUDE.md);
                   its *.spec.ts (not approved/) also run in `npm run test`, so drafts must keep tests green
```

Modules: auth, buildings, rooms, pricing, viewings, contracts, meters, billing, bank, requests, notifications, reports, settings, files, mailer, audit.

Before working on a module, open its `feature_<feature>.md` (e.g. `src/modules/auth/feature_login.md`), read its "Before you start" list, and follow the task workflow in the root `CLAUDE.md`.

## Rules

- Controllers are thin: validate DTO, call one service method, return `{ data }`. Business logic lives in services.
- Every staff query goes through the building-scope helper (`SCOPE-02`); tenant queries through `tenant_id = user.id` (`SCOPE-03`).
- Multi-step and money flows run in one `prisma.$transaction`. Status changes use conditional updates (`where: { id, status: 'UNPAID' }`) and treat 0 updated rows as `CONFLICT_STATE`.
- Map Prisma/Postgres errors (unique, FK, CHECK, trigger messages like `MANAGER_MAX_2_BUILDINGS`) to spec error codes in the global filter; never leak raw DB messages.
- Period/date math lives in one tested helper (`BIL-01`, `BIL-02`); never compute periods inline.
- Money: `number` integers only; no `Decimal`/float math except `rooms.area_m2`.
- Write `audit_logs` for actions listed in `AUD-01`.
- `src/app.module.ts` currently imports `ObserveModule` with placeholder keys (`YOUR_APP_KEY`). Remove it in phase 1 unless the owner provides real keys.

## Tests

Vitest. Name tests with spec IDs: `it('BIL-09: example invoice totals 3.119.000', ...)`. Required unit tests: period helper, tier calculation, invoice calculation, settlement math, webhook matching, scope guard.
