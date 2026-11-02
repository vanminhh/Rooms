# Trọ Thông Minh – Specification

This folder is the **single source of truth** for what the system must do. Code, tests and UI follow it. If code and spec disagree, the spec wins until the spec is changed on purpose.

## How to read

1. Always read [00-overview.md](00-overview.md) (roles, glossary, global rules, decisions).
2. Read [01-architecture.md](01-architecture.md) before touching API, auth or folder layout.
3. Read [02-database.md](02-database.md) before touching the schema.
4. Then read only the module file(s) for your task.

## Files

| File | Covers |
|---|---|
| [00-overview.md](00-overview.md) | Product, roles, hierarchy, glossary VI↔EN, global rules, decisions, assumptions, open questions |
| [01-architecture.md](01-architecture.md) | FE/BE/DB responsibilities, folder layout, API conventions, error codes, auth tokens, cron |
| [02-database.md](02-database.md) | Schema conventions, 26 tables, rules enforced by DB vs BE, how to run the DB check |
| [10-auth.md](10-auth.md) | Login, sessions, passwords, roles, building scope |
| [11-buildings-rooms.md](11-buildings-rooms.md) | Buildings, managers, rooms, services, public listing |
| [12-pricing.md](12-pricing.md) | Room prices, rate plans (electric tiers, water, services), approval |
| [13-viewings.md](13-viewings.md) | Viewing appointments (lịch hẹn xem phòng) |
| [14-contracts.md](14-contracts.md) | Contract lifecycle, tenant account, occupants, vehicles, renewal, cancel |
| [15-meters.md](15-meters.md) | Meter readings (chốt chỉ số) |
| [16-billing.md](16-billing.md) | Billing periods, invoice calculation, manual payment, reissue, settlement |
| [17-bank.md](17-bank.md) | Bank webhook, matching, unmatched transactions |
| [18-requests.md](18-requests.md) | Incidents and tenant requests |
| [19-notifications.md](19-notifications.md) | Announcements, in-app inbox, email reminders |
| [20-reports-audit-settings.md](20-reports-audit-settings.md) | Reports, audit log, settings |
| [30-frontend.md](30-frontend.md) | 3 apps, 31 pages with routes, UI rules, Vietnamese labels |
| [31-ui-kit.md](31-ui-kit.md) | Official UI kit in `Source/frontend/src/components/` (An Lâm style), usage rules, preview, tests |

Schema files: [Source/backend/prisma/schema.prisma](../../Source/backend/prisma/schema.prisma) · [constraints.sql](../../Source/backend/prisma/constraints.sql) · [check-constraints.mjs](../../Source/backend/prisma/check-constraints.mjs).

## Conventions in this spec

- Requirement IDs: `<MODULE>-<nn>`, e.g. `CON-07`. Reference them in test names (`it('CON-07: ...')`) and commit messages.
- **MUST** = required. **SHOULD** = default unless there is a reason. **MAY** = optional.
- `code` style = exact identifiers (tables, enums, routes, error codes).
- Vietnamese in quotes = exact UI text.
- `[ASSUMPTION]` = decided by the spec writer, not yet confirmed by the owner. Implement it, keep it easy to change, list it in your summary.
- `[OPEN]` = not decided. Do not implement; ask the owner.

## Status

Phase 1 (Foundation) is done: the UI kit (`Source/frontend/src/components/`, `npm run test:components` 234 tests, including the auth tests), login for the 3 roles (`auth` module in `Source/backend`; `/dang-nhap`, password pages and account pages in `Source/frontend`), the first migration and the Phase 1 seed (DB check 50/50). No other feature exists yet; current phase: 2 · Rooms. Task lists per feature: `Source/backend/src/modules/<module>/feature_<name>.md` and `Source/frontend/src/features/<module>/feature_<name>.md`; Phase 1 task lists and QA: `docs/phase-1-foundation/`. Roadmap: [01-architecture.md#roadmap](01-architecture.md#roadmap).
