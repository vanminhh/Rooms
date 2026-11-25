# Phase 5 · Part 9 – QA and phase close (QA-P5-01..06)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every migration, deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

| | |
|---|---|
| Needs first | P5-1..P5-8 committed |
| Unblocks | next phase |
| How | main session; `cleanup.mjs --apply` only with the owner's agreement |
| Part done when | QA-P5-06 verified and the owner walked the flows |

## Before you start (read, in this order)

1. `CLAUDE.md` (root), `Source/backend/CLAUDE.md`, `Source/frontend/CLAUDE.md`, `docs/LESSONS.md`
2. [README.md](README.md) of this phase (owner answers Q-P5-1..16) and `docs/spec/00-overview.md` – **D-45**
3. [plans/PHASE/PLAN.md](plans/PHASE/PLAN.md) – §5 (rule → part), §7 (test strategy)
4. Acceptance sections of `docs/spec/18-requests.md`, `19-notifications.md`, `20-reports-audit-settings.md`, `14-contracts.md` (CON-17..21)
5. `docs/phase-4-money/p4-9-qa-checklist.md` as the checklist model

## Scope

In: acceptance, DB check, e2e on dev, two-connection races, regression, closing docs.
Out: new features.

## Tasks

- [x] **QA-P5-01** Run every Acceptance line of 18, NOTI-01..03 of 19, Reports/Audit/Settings of 20 (incl. 80 / 5 million) and CON-17..21 of 14; mark each with its test name.
  Done when: every line marked in `p5-9-qa-checklist.md`.
- [x] **QA-P5-02** `node prisma/check-constraints.mjs . prisma` with the M1, M2, M3 scenarios.
  Done when: the real count printed is recorded.
- [x] **QA-P5-03** e2e on dev, one file at a time (LESSONS commands): incident → review; MOVE_OUT → approve → settlement; renewal → sign → switch; one month report. Re-run a suspicious case alone before calling it a logic bug; keep file names + exit codes per run.
  Done when: all files pass; run log saved.
- [x] **QA-P5-04** Two races on two connections: approving the same request twice (one `CONFLICT_STATE`, payload applied once); two switch-job runs (one `SWITCHED`, occupants/vehicles copied once). Committed fixtures, soft cleanup.
  Done when: both races have exactly one winner; cleanup CLEANED.
- [x] **QA-P5-05** Regression: login for 4 roles + entry (D-43), Phase 4 money loop, Phase 3 deposit loop, public pages and viewings; `scripts/e2e/cleanup.mjs` list.
  Owner accepted the regression results and a cleanup exception on 26/11/2026. The global check returned exit 1 for 141 legacy fixture rows from 03–06/11. See [M9 checklist](p5-9-qa-checklist.md).
- [x] **QA-P5-06** ⏸ Update `PROGRESS.md`, Status in `docs/spec/README.md` and root `CLAUDE.md`, `02-database.md` (M1, M2, M3), `LESSONS.md`; write `p5-9-qa-checklist.md`; suggest the commit message with task and spec IDs.
  Done when: docs updated; owner walk recorded.

## Questions for the owner

<!-- Q-P5-1..16 were answered on 24/11/2026 (README.md, D-45). New questions go here and in the README table. -->

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
