# Phase 3 · Part 8 – QA and closing (QA-P3-01..06)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. This part changes no feature code: a bug found here is reported to the owner, then fixed as its own small task with the ID of the part it belongs to. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

| | |
|---|---|
| Needs first | P3-1..P3-7 committed |
| How | by hand, with the owner |
| Part done when | QA-P3-06 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root), `docs/LESSONS.md`
2. [README.md](README.md) – sections 4 (rights), 6 (old data), 7 (tests)
3. The "Acceptance" list of `docs/spec/14-contracts.md` (all lines except the renewal one, which is Phase 5)
4. `docs/phase-extra-home101/ex-9-qa-checklist.md` – the format to follow

## Tasks

- [ ] **QA-P3-01** Write `p3-8-qa-checklist.md` in this folder: one line per acceptance item of spec 14 in scope, per deposit rule of D-35 (VietQR, manual payment, move-in, cancel with settlement), per privacy rule of D-37 and CON-16 (signed URLs expire, audit rows, tenant sees only last 4 digits), the end dates of D-41 (BIL-02, BIL-22), the "Đã gọi" task of D-39, move-in without meter photos (D-38), with the steps to do by hand and the expected result taken from the spec.
  Done when: the owner has read the list.
- [ ] **QA-P3-02** Automated checks on a clean tree: backend `npm run lint`, `npm run test`, `npm run build`, e2e (command in `LESSONS.md`); frontend `npm run lint`, `npm run build`, `npm run test:components`; `node prisma/check-constraints.mjs . prisma`.
  Done when: all pass; the real counts are written in the checklist.
- [ ] **QA-P3-03** Manual walk of the checklist on the dev database with two browsers (manager and tenant), at desktop and 360 px, the tenant side in Vietnamese and English; print preview checked.
  Done when: every line is marked pass or has a bug entry in the Issues log.
- [ ] **QA-P3-04** Regression: the 4 roles log in; guest sign-up and viewings of Phase Extra; a manager is still limited to 2 buildings; price approval; public lists follow ROOM-05 (a room with a HOLD contract disappears, a cancelled one comes back); no `/public/*` response contains contract, occupant or invoice data.
  Done when: each point is marked pass in the checklist.
- [ ] **QA-P3-05** Clean the dev database of rows left by e2e runs with `scripts/e2e/cleanup.mjs`; list mode first, apply mode only after the owner agrees.
  Done when: the owner confirms the cleanup result.
- [ ] **QA-P3-06** ⏸ Close the phase: update the "Status" paragraphs of `docs/spec/README.md`, root `CLAUDE.md` and `AGENTS.md` (Phase 3 done, real test and DB-check counts, next Phase 4); set the status line of [README.md](README.md) and [PROGRESS.md](PROGRESS.md); note whether Q-15 (the real contract text) is still open.
  Done when: the owner approves the texts.

## Questions for the owner

<!-- none yet -->

## Issues log

<!-- date · part and task ID · what failed · what is needed -->
