# Phase 2 · Part 3 – Backend buildings, services, managers (BE-P2-11..16)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified on the main files. Do tasks in order. Every task is drafted in `Source/backend/artifact_BE/` and approved by the owner before it touches main files (root `CLAUDE.md`). All parts and their order: [README.md](README.md).

| | |
|---|---|
| Needs first | Part 2 on the main files |
| Unblocks | Part 4 |
| Draft folder | `Source/backend/artifact_BE/<YYYY-MM-DD>-BE-P2-11-16/` |
| How | Pipeline |
| Part done when | BE-P2-16 on the main files |

## Before you start (read, in this order)

1. `CLAUDE.md` (root) and `Source/backend/CLAUDE.md`
2. `docs/spec/00-overview.md`, `docs/spec/01-architecture.md`
3. `docs/spec/10-auth.md` – AUTH-08, SCOPE-02, SCOPE-04
4. `docs/spec/11-buildings-rooms.md` – BLD-01..07, SVC-01..05
5. `docs/spec/20-reports-audit-settings.md` – AUD-01
6. Part 2 code: `src/common/{errors,date,rates,rooms}`, `test/e2e-run.ts`

## Scope

In: `/buildings`, `/services`, `/managers`.
Out: rooms (part 4), rate plans and their approval (part 5), public endpoints (part 6).

## Tasks

- [ ] **BE-P2-11** `GET/POST/PATCH /buildings` in `src/modules/buildings`: Boss creates and edits every field (BLD-01, BLD-06 code format); managers edit only `amenities` (array of strings) and `description` of their own buildings, any other field → 403 (BLD-02); list in scope with `?includeInactive=true` (BLD-07).
  Done when: unit tests BLD-01, BLD-02, BLD-06 code; acceptance spec 11 "Manager cannot change code/address/manager_id (403)".
- [ ] **BE-P2-12** Assign / unassign a manager on `PATCH /buildings/:id` (BLD-03): active MANAGER with fewer than 2 buildings; audit `building.manager_change`.
  Done when: tests: third building → `MANAGER_MAX_2_BUILDINGS`; inactive or non-manager → `VALIDATION_FAILED`.
- [ ] **BE-P2-13** Lock / unlock a building (BLD-06): Boss only; refused with HOLD/ACTIVE contracts (`CONFLICT_STATE`); locking sets `manager_id = null` + audit; response includes the count of NEW/CONFIRMED viewings (VIEW-13).
  Done when: tests for the three cases; after locking, the old manager can be assigned another building.
- [ ] **BE-P2-14** Public contact resolver `buildingContact(building)` (BLD-04): active manager with `contact_phone` → theirs; otherwise `settings.default_contact`; never the login phone. Used by part 6.
  Done when: tests: no manager, inactive manager, manager without `contact_phone`, normal case; acceptance spec 11 "Building with manager deactivated shows Boss's contact".
- [ ] **BE-P2-15** `GET/POST/PATCH /services` (SVC-01, SVC-02, SVC-04): GET staff in scope with "has a rate in effect" flag; POST/PATCH Boss; lock instead of delete.
  Done when: unit tests; duplicate name in a building → `VALIDATION_FAILED`.
- [ ] **BE-P2-16** `GET/POST/PATCH /managers` in `src/modules/auth/managers.*` (AUTH-08): create returns the temporary password once; deactivate revokes sessions and keeps `manager_id`; reactivate; audit `manager.create`, `manager.deactivate`. Then `npm run lint`, `test`, `build`, `test:e2e` (BE-P2-09 runner) pass.
  Done when: acceptance spec 10 new manager forced to change password, deactivated manager's refresh fails, building shows Boss's contact while the manager is inactive; all checks pass; list every `[ASSUMPTION]`.

## Questions for the owner

None yet.

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
