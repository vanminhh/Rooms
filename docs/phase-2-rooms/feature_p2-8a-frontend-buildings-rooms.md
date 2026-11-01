# Phase 2 · Part 8a – Frontend skeleton, buildings, staff, rooms (FE-P2-01..08)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified on the main files. Do tasks in order. Every task is drafted in `Source/frontend/artifact_FE/` and approved by the owner before it touches main files (root `CLAUDE.md`). All parts and their order: [README.md](README.md).

| | |
|---|---|
| Needs first | Backend part 4 and mockup part 7 approved |
| Unblocks | Parts 8b and 9 (they only add their own files) |
| Draft folder | `Source/frontend/artifact_FE/<YYYY-MM-DD>-FE-P2-01-08/` |
| How | Pipeline (may run in parallel with backend parts 5 and 6) |
| Part done when | FE-P2-08 on the main files; Boss and a manager set up a building and its rooms in the browser against the real API |

## Before you start (read, in this order)

1. `CLAUDE.md` (root) and `Source/frontend/CLAUDE.md`
2. `docs/spec/00-overview.md`, `docs/spec/01-architecture.md` (API-02/03, FILE-01/02)
3. `docs/spec/10-auth.md` – AUTH-08; `docs/spec/11-buildings-rooms.md` – BLD, ROOM, SVC
4. `docs/spec/30-frontend.md` – staff pages and UI-01..10; `docs/spec/31-ui-kit.md` and `src/components/README.md`
5. The approved mockup of part 7 (`ref/` and its `REVIEW.md`; the spec wins where they differ)

## Tasks

- [ ] **FE-P2-01** Skeleton: every Phase 2 route (`/ql/toa-nha`, `/ql/toa-nha/:id`, `/ql/nhan-su`, `/ql/phong`, `/ql/don-gia`, `/ql/duyet-gia`, `/ql/lich-hen`, `/phong`, `/toa/:id`, `/phong/:id`) and menu item (by role) points to its own page file; pages not built here show "Đang làm". `test:components` gets one extra entry `tests/p2/*.test.mjs`.
  Done when: every route renders; Boss-only items hidden for managers; old tests still pass.
- [ ] **FE-P2-02** `src/shared/status-labels.ts` – one map for room status, VIEW-10 and PRC-10 labels (UI-02).
  Done when: test that every enum value has a label.
- [ ] **FE-P2-03** Building selector in `StaffLayout` (Boss: all + "Tất cả tòa"; manager: own), kept for the session.
  Done when: tests for both roles.
- [ ] **FE-P2-04** Kit pieces needed by several pages, added to `src/components/` per KIT-07 (e.g. confirm dialog for UI-04, image uploader). Parts 8b and 9 do not add kit pieces.
  Done when: kit tests and `components.html` show them.
- [ ] **FE-P2-05** `/ql/toa-nha` + `/ql/toa-nha/:id`: Boss creates, edits, assigns manager, services, lock/unlock with the confirm text of BLD-06 and VIEW-13, "Hiện tòa đã khóa"; manager edits amenities and description only.
  Done when: tests for role differences and API errors mapped onto fields (UI-05).
- [ ] **FE-P2-06** `/ql/nhan-su` (AUTH-08): list, create with the temporary password shown once, deactivate/reactivate.
  Done when: tests; the password is not kept after the dialog closes.
- [ ] **FE-P2-07** `/ql/phong`: floor grid per mockup with derived status, "Hiện phòng đã khóa", create/edit, maintenance/lock with the VIEW-13 count, images (sign → upload → send `publicId`, 5 MB check, `UPLOAD_NOT_CONFIGURED` message from the API).
  Done when: tests; every list has the 4 states (UI-03).
- [ ] **FE-P2-08** `npm run lint`, `npm run build`, `npm run test:components` (draft `package.json`) pass; manual check against the running API after applying.
  Done when: all pass.

## Questions for the owner

None yet.

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
