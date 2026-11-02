# Phase 2 · Part 6 – Backend public API, viewings, "Việc hôm nay" (BE-P2-29..35)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified on the main files. Do tasks in order. Every task is drafted in `Source/backend/artifact_BE/` and approved by the owner before it touches main files (root `CLAUDE.md`). All parts and their order: [README.md](README.md).

| | |
|---|---|
| Needs first | Part 5 on the main files |
| Unblocks | Frontend parts 8b and 9 |
| Draft folder | `Source/backend/artifact_BE/<YYYY-MM-DD>-BE-P2-29-35/` |
| How | Pipeline |
| Part done when | BE-P2-35 on the main files |

## Before you start (read, in this order)

1. `CLAUDE.md` (root) and `Source/backend/CLAUDE.md`
2. `docs/spec/00-overview.md` (A-03, A-05), `docs/spec/01-architecture.md`
3. `docs/spec/11-buildings-rooms.md` – BLD-04, BLD-05, ROOM-05, ROOM-08, PUB-01..04
4. `docs/spec/13-viewings.md` – VIEW-01..13 (VIEW-05, VIEW-06 are Phase 3)
5. `docs/spec/19-notifications.md` – NOTI-06 Phase 2 note; `docs/spec/12-pricing.md` – PRC-11
6. Code of parts 2–5 (`public-room.ts`, `rates-at.ts`, `buildingContact`)

## Scope

In: `/public/*` (controllers inside `buildings` and `rooms`), `viewings` module, `GET /dashboard` in `notifications`.
Out: VIEW-05, VIEW-06 (need contracts – Phase 3), other dashboard groups (later phases).

## Tasks

- [ ] **BE-P2-29** `GET /public/locations`, `GET /public/rooms` (filters, `sort`, `meta`), `GET /public/featured-rooms` (PUB-01, ROOM-05, BLD-05).
  Done when: acceptance spec 11 "price = null never appears"; e2e on seed: CG01/203 and CG01/301 absent; building without E/W rate has no rooms.
- [ ] **BE-P2-30** `GET /public/rooms/:id`, `GET /public/buildings/:id` (PUB-02..04, ROOM-08, BLD-04): images, deposit, today's and upcoming rates, `monthlyEstimate`, contact; non-public → 404.
  Done when: tests for ROOM-08 on a PER_M3 and a PER_PERSON building, a service without a rate, a locked service; no internal field in the body.
- [ ] **BE-P2-31** `POST /public/viewings` (VIEW-01, VIEW-02, VIEW-08, VIEW-11, VIEW-12): honeypot, per-IP limit in memory, per-phone count with `pg_advisory_xact_lock`, same body without id.
  Done when: acceptance spec 13 "non-public room → ROOM_NOT_AVAILABLE", "4th submission same phone → 429"; parallel submissions; slot already started; date > 30 days.
- [ ] **BE-P2-32** `GET /viewings?buildingId&status&from&to`, `POST /viewings` manual (VIEW-03), `PATCH /viewings/:id` (VIEW-04, VIEW-09) with conditional updates and `handled_by_id`.
  Done when: tests: WON refused, NEW → LOST refused, LOST without note refused, change date only while NEW/CONFIRMED, manual for a non-public active room works.
- [ ] **BE-P2-33** `GET /dashboard?buildingId` in `src/modules/notifications/dashboard.*` (NOTI-06 Phase 2, VIEW-07, PRC-11).
  Done when: tests: manager counts own NEW viewings; Boss counts only buildings without an active manager; expired proposals not counted.
- [ ] **BE-P2-34** VIEW-13: locking a building/room or maintenance keeps viewings; the locked building's viewings show on Boss's card.
  Done when: e2e test with the BE-P2-09 runner.
- [ ] **BE-P2-35** `npm run lint`, `test`, `build`, `test:e2e` pass.
  Done when: all pass; list every `[ASSUMPTION]` (A-03).

## Questions for the owner

None yet.

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
