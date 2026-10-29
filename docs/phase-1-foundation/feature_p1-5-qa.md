# Phase 1 · Part 5 – Manual checks and phase exit (P1-QA-01..04, FE-LOGIN-17)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: these checks run on the main files after the part they check is applied. Record every result (date, what was checked, pass/fail) in the "Issues log" below. All parts and their order: [README.md](README.md).

| | |
|---|---|
| Needs first | P1-QA-01: nothing. The others: the part named in each task, on the main files |
| Unblocks | The end of Phase 1 |
| How | By hand, no pipeline. Running the backend needs `Source/backend/.env` (P1-SETUP-01) |
| Part done when | P1-QA-04 is `[x]` |

## Tasks

- [ ] **P1-QA-01** Write the manual checklist in the section below, from FE-LOGIN-17 and the AUTH cases of BE-LOGIN-24 (part 2): plain Vietnamese steps a non-developer can follow – which seeded account, what to type, what must show on screen.
  Done when: every case of FE-LOGIN-17 and every AUTH case of BE-LOGIN-24 has a step. Can start right away.
- [x] **P1-QA-02** After part 1 is applied: run the database rule check as in `docs/spec/02-database.md` ("Run the DB check"), from `Source/backend/prisma/`.
  Done when: it prints 50/50; result recorded below.
- [ ] **P1-QA-03** After part 2 is applied: with the API running on the seeded dev database, log in with each seeded role through `POST /api/v1/auth/login` (any REST client), then try the inactive tenant (AUTH-02) and 6 wrong passwords in a row (AUTH-04).
  Done when: the answers match the cases listed in BE-LOGIN-24; results recorded below.
- [ ] **FE-LOGIN-17** Manual end-to-end with the backend running and seed data, at 360 px and desktop width:
  - BOSS and MANAGER land on `/ql`, TENANT on `/thue` (AUTH-06)
  - the seeded tenant with the flag is forced to `/doi-mat-khau` and can continue after changing (AUTH-05)
  - inactive tenant sees "Tài khoản đã bị khóa. Liên hệ quản lý." (AUTH-02)
  - reload keeps the session when "Ghi nhớ đăng nhập" was ticked; logout returns to `/`
  - keyboard only: every field and button reachable, focus visible (UI-08)
  Record the result (date, what was checked) in the Issues log below.
  Needs first: part 4 applied.
- [ ] **P1-QA-04** Phase 1 exit, the roadmap's "Done when" (`docs/spec/01-architecture.md#roadmap`): 3 roles log in and land in the right layout (FE-LOGIN-17); the DB check still prints 50/50 (P1-QA-02); unit tests for the scope guard exist and pass (`npm run test` in `Source/backend`, BE-LOGIN-22). Then "Status" in root `CLAUDE.md` and `docs/spec/README.md` moves to phase 2 (through a draft).
  Done when: all three hold and both "Status" lines are updated.

## Manual checklist

<!-- P1-QA-01 writes the steps here. -->

## Questions for the owner

- None yet.

## Issues log

<!-- date · task ID · what was checked · pass/fail · what is needed -->
- 29/10/2026 · P1-QA-02 · after part 1 applied, in `Source/backend`: `npm i --no-save @electric-sql/pglite@0.2`, `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script -o prisma/schema.sql`, `node prisma/check-constraints.mjs . prisma` → "50/50 tình huống đúng như mong đợi" · pass · none
