# Phase 3 · Part 5 – Backend: occupants, CCCD photos, vehicles, services (BE-P3-23..27)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every migration, deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

| | |
|---|---|
| Needs first | P3-4 committed (same module) |
| Unblocks | the occupant and vehicle screens of P3-6, the tenant contract detail of P3-7 |
| How | main session builds → reviewer before the stop (personal data) |
| Part done when | BE-P3-27 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root), `Source/backend/CLAUDE.md`, `docs/LESSONS.md`
2. `docs/spec/00-overview.md` – D-07, D-17, D-37
3. `docs/spec/14-contracts.md` – CON-13..16, API table
4. `docs/spec/02-database.md` – DB-B5, DB-B6, DB-B9, the occupant and vehicle rules; `docs/spec/20-reports-audit-settings.md` – AUD-01, AUD-02
5. Code: the contracts service, the P3-1 CCCD and private-upload helpers, `src/modules/rooms/rooms.service.ts` (how active occupants are counted for `max_occupants`), `src/modules/buildings/services.service.ts`

## Scope

In: occupant add/edit/move-out, CCCD photos and their signed view, vehicles and the plate lookup, editing the services of a contract.
Out: tenant change requests `OCCUPANT_CHANGE` / `VEHICLE_CHANGE` (Phase 5, CON-15); billing effects of services and vehicles (Phase 4).

## Tasks

- [ ] **BE-P3-23** Occupants (CON-13, DB-B6, CON-04): `GET/POST/PATCH /contracts/:id/occupants` for staff in scope; active occupants ≤ `max_occupants` with the counting rule of DB-B6; exactly one signer; CCCD encrypted with `last4`; photos are verified private `ID_PHOTO` assets of this contract; moving out sets `move_out_date`, never deletes.
  Done when: tests `CON-13: …` including the limit on the day someone moves out (counted through that day) and a second signer refused.
- [ ] **BE-P3-24** CCCD photo view (CON-16, DB-B9): `GET /contracts/:id/occupants/:oid/id-photos` returns signed URLs valid ≤ 5 minutes and writes `occupant.view_id`; staff in scope only; the tenant routes never expose photos or the full number.
  Done when: tests: each call writes one audit row; another building → `OUT_OF_SCOPE`; a tenant token → `FORBIDDEN`.
- [ ] **BE-P3-25** ⏸ Vehicles (CON-14, DB-B5, D-07): `GET/POST/PATCH /contracts/:id/vehicles`; plate normalized (uppercase, no spaces); `service_id` must be a VEHICLE service of the building; removing sets `is_active = false` and `removed_at`; an active plate elsewhere → the friendly error mapped from the DB rule; `GET /vehicles?plate=` for "Tra cứu xe" in scope.
  Done when: tests `CON-14: …`: duplicate active plate refused, a removed plate can be registered again, lookup finds by partial plate within scope only. Stop and report BE-P3-23..25.
- [ ] **BE-P3-26** Contract services (D-07, DB-B5): `GET/PATCH /contracts/:id/services` for HOLD and ACTIVE contracts; only ROOM/PERSON services of the same building; audit the change.
  Done when: tests for a service of another building and a VEHICLE service, both refused.
- [ ] **BE-P3-27** ⏸ `npm run lint`, `npm run test`, `npm run build`, e2e (occupants and vehicles on the dev DB). Run the reviewer on the uncommitted changes and put its full report in the checkpoint report.
  Done when: all pass with real output quoted; no response or log contains a full CCCD number; list the `[ASSUMPTION]`s used.

## Questions for the owner

<!-- none yet -->

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
