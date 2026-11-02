# Phase 2 · Part 4 – Backend rooms and images (BE-P2-17..21)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified on the main files. Do tasks in order. Every task is drafted in `Source/backend/artifact_BE/` and approved by the owner before it touches main files (root `CLAUDE.md`). All parts and their order: [README.md](README.md).

| | |
|---|---|
| Needs first | Part 3 on the main files |
| Unblocks | Part 5; frontend part 8a |
| Draft folder | `Source/backend/artifact_BE/<YYYY-MM-DD>-BE-P2-17-21/` |
| How | Pipeline |
| Part done when | BE-P2-21 on the main files |

## Before you start (read, in this order)

1. `CLAUDE.md` (root) and `Source/backend/CLAUDE.md`
2. `docs/spec/00-overview.md`, `docs/spec/01-architecture.md` (FILE-01, FILE-02)
3. `docs/spec/10-auth.md` – SCOPE-02
4. `docs/spec/11-buildings-rooms.md` – ROOM-01..09, room status table, BLD-07
5. `docs/spec/12-pricing.md` – PRC-07 (expired flag for the grid)
6. Part 2 and 3 code: `src/common/*`, `src/modules/files`, `src/modules/buildings`

## Scope

In: `/rooms`, `/rooms/:id/images`, derived room status, data for the floor grid.
Out: price proposals (part 5), public listing (part 6).

## Tasks

- [ ] **BE-P2-17** `GET/POST/PATCH /rooms` in scope (ROOM-01): `price` is never written (ROOM-02); `furniture` is an array of strings; duplicate code text and no create in a locked building (ROOM-06).
  Done when: unit tests ROOM-01, ROOM-02, ROOM-06; manager A → `OUT_OF_SCOPE` on manager B's room (SCOPE-02).
- [ ] **BE-P2-18** Maintenance and lock (ROOM-03, ROOM-04, ROOM-09): refused with HOLD/ACTIVE contracts; response gives the count of NEW/CONFIRMED viewings.
  Done when: tests on seed CG01/203 (ACTIVE contract) refused; a free room works; count returned.
- [ ] **BE-P2-19** `src/modules/rooms/room-status.ts` – derived status by the spec priority (Đang thuê, Đã cọc, Bảo trì, Trống), never stored.
  Done when: unit test for each row and for the priority order.
- [ ] **BE-P2-20** Floor-grid list: floor, code, area, price, status, PENDING / expired proposal (PRC-07), image count; `?includeInactive=true` (BLD-07); `meta` paging.
  Done when: unit tests; one query per page (no N+1).
- [ ] **BE-P2-21** Images (ROOM-07, FILE-02): add with `publicId` + `version` + `format` only, max 10, order, delete (row then Cloudinary, failure logged). Then `npm run lint`, `test`, `build`, `test:e2e` pass.
  Done when: tests: 11th image refused, wrong folder → 400, URL built by the BE, Cloudinary delete failure does not fail the request; all checks pass; list every `[ASSUMPTION]`.

## Questions for the owner

None yet.

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
