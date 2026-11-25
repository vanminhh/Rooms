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
| [01-architecture.md](01-architecture.md) | FE/BE/DB responsibilities, folder layout, API conventions, languages, error codes, auth tokens, cron |
| [02-database.md](02-database.md) | Schema conventions, 26 tables, rules enforced by DB vs BE, how to run the DB check |
| [10-auth.md](10-auth.md) | Login, sign-up with an email code, sessions, passwords, roles, building scope |
| [11-buildings-rooms.md](11-buildings-rooms.md) | Buildings, managers, rooms, services, public listing |
| [12-pricing.md](12-pricing.md) | Room prices, rate plans (electric tiers, water, services), approval |
| [13-viewings.md](13-viewings.md) | Viewing appointments (lịch hẹn xem phòng): booking an hour with an account, confirmation by the manager |
| [14-contracts.md](14-contracts.md) | Contract lifecycle, tenant account, occupants, vehicles, renewal, cancel |
| [15-meters.md](15-meters.md) | Meter readings (chốt chỉ số) |
| [16-billing.md](16-billing.md) | Billing periods, invoice calculation, manual payment, reissue, settlement |
| [17-bank.md](17-bank.md) | Bank webhook, matching, unmatched transactions |
| [18-requests.md](18-requests.md) | Incidents and tenant requests |
| [19-notifications.md](19-notifications.md) | Announcements, in-app inbox, email reminders |
| [20-reports-audit-settings.md](20-reports-audit-settings.md) | Reports, audit log, settings |
| [30-frontend.md](30-frontend.md) | 4 areas, 36 pages with routes, UI rules, labels, entry screen, languages |
| [31-ui-kit.md](31-ui-kit.md) | Official UI kit in `Source/frontend/src/components/` (An Lâm style), usage rules, preview, tests |

Schema files: [Source/backend/prisma/schema.prisma](../../Source/backend/prisma/schema.prisma) · [constraints.sql](../../Source/backend/prisma/constraints.sql) · [check-constraints.mjs](../../Source/backend/prisma/check-constraints.mjs).

## Conventions in this spec

- Requirement IDs: `<MODULE>-<nn>`, e.g. `CON-07`. Reference them in test names (`it('CON-07: ...')`) and commit messages.
- **MUST** = required. **SHOULD** = default unless there is a reason. **MAY** = optional.
- `code` style = exact identifiers (tables, enums, routes, error codes).
- Vietnamese in quotes = exact UI text.
- `[ASSUMPTION]` = decided by the spec writer, not yet confirmed by the owner. Implement it, keep it easy to change, list it in your summary.
- `[OPEN]` = not decided. Do not implement; ask the owner.
- "Changed 12/11/2026" / "Phase Extra EX-n" on a rule = the owner changed or added it after Phase 1 and 2 were built (Home101 brief, decisions D-23..D-34 in [00-overview.md](00-overview.md)). Phase Extra is implemented and accepted as of 16/11/2026; these labels preserve decision history. Record: `docs/phase-extra-home101/README.md`.

## Status

P5-7 and P5-8 accepted on 25/11/2026. The owner closed P5-9 and Phase 5 on 26/11/2026 and accepted the 141 legacy dev test rows as a separate follow-up. [Acceptance checklist](../phase-5-operations/p5-9-qa-checklist.md).

Phase 1 (Foundation), Phase 2 (Rooms) and **Phase Extra (Home101) are complete**. On 16/11/2026 the owner accepted EX-6, EX-7, EX-8 and EX-9, including the phone-whitespace fix, booking-success popup and acknowledged cross-building overlap warning. The final record is [ex-9-qa-checklist.md](../phase-extra-home101/ex-9-qa-checklist.md); [PROGRESS.md](../phase-extra-home101/PROGRESS.md) keeps the dated history.

**Phase 3 (Contracts) is complete**: the owner accepted the manual walk on 22/11/2026. Record: [p3-8-qa-checklist.md](../phase-3-contracts/p3-8-qa-checklist.md); history: [PROGRESS.md](../phase-3-contracts/PROGRESS.md). **Phase 4 (Money) is complete.** Final regression passed (75/75 across 16 E2E files). The owner confirmed the dev database cleanup listing showed CLEANED on 24/11/2026 ([checklist](../phase-4-money/p4-9-qa-checklist.md)).

Recorded verification: frontend **864/864**, lint/build pass; backend after option B **169/169 offline**, lint/build pass; host baseline before B **1806/1806** and dev e2e **54/54**; DB checker **82/82** on 15/11/2026. The owner's acceptance is recorded separately from test output, without inventing a new HTTP/e2e run.

Completed: **Phase 5 · Operations** (owner decisions D-45, 24/11/2026: requests with the repair review, notifications inbox and announcements, renewal, reports, audit log, settings); parts and progress in `docs/phase-5-operations/`. Phase 3/4 history stays in `docs/phase-3-contracts/` and `docs/phase-4-money/`. Phase 1/2 history stays in `docs/phase-1-foundation/` and `docs/phase-2-rooms/`. Roadmap: [01-architecture.md#roadmap](01-architecture.md#roadmap).
