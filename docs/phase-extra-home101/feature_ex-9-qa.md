# Phase Extra · Part 9 – QA and closing (QA-EX-01..06)

**Owner acceptance — 16/11/2026:** EX-6, EX-7, EX-8 and EX-9 were explicitly accepted as OK, including the phone-whitespace fix, success popup and overlap warning. Tasks below are closed on that owner sign-off and the existing verification record. This is not a new agent-run HTTP/e2e, browser or DB result. Consolidated evidence: [ex-9-qa-checklist.md](ex-9-qa-checklist.md). Earlier pending entries remain historical.

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. This part changes no feature code: a bug found here is reported to the owner, then fixed as its own small task with the ID of the part it belongs to. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

| | |
|---|---|
| Needs first | EX-1..EX-8 committed |
| How | by hand, with the owner |
| Part done when | QA-EX-06 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root)
2. [README.md](README.md) – sections 4 (rights), 6 (old data), 7 (tests)
3. `docs/home101-adoption-brief.md` – section 8 (what must be verified)
4. The "Acceptance" lists of `docs/spec/10-auth.md`, `11-buildings-rooms.md`, `13-viewings.md`
5. `docs/phase-2-rooms/p2-10-qa-checklist.md` – the format to follow and the Phase 2 checks to repeat

## Closure basis

The owner explicitly accepted EX-9 before this ledger consolidation. QA-EX-01/06 now collect the existing criteria, evidence and status in one place; this does not assert the owner has read a newly generated file. QA-EX-02 retains the measured counts and distinguishes the pre-B host run from the later offline tests. QA-EX-03/04 are owner-reported acceptance at part level. QA-EX-05 retains the host cleanup result and the owner's accepted older Phase 2 records; no new cleanup is executed.

## Tasks

- [x] **QA-EX-01** Write `ex-9-qa-checklist.md` in this folder: one line per acceptance item of the specs above and per row of the brief's section 8 that is in scope (ENTRY, ACCOUNT, LOCALE, VIEW, SEARCH, NOTIFY, regression), each with the steps to do by hand and the expected result taken from the spec.
  Done when: the owner has read the list.
- [x] **QA-EX-02** Automated checks on a clean tree: backend `npm run lint`, `test`, `build`, `test:e2e`; frontend `npm run lint`, `build`, `test:components`; `node prisma/check-constraints.mjs . prisma`.
  Done when: all pass; the real counts are written in the checklist.
- [x] **QA-EX-03** Manual walk of the checklist on the dev database, in Vietnamese and in English, at 360 px and desktop, with reduced-motion on and off.
  Done when: every line is marked pass or has a bug entry in the Issues log.
- [x] **QA-EX-04** Regression of Phase 1 and 2: the old accounts of the 3 staff/tenant roles log in; a manager is still limited to 2 buildings; Boss takes over a building without a manager; public lists still follow ROOM-05; price approval still works; no `/public/*` response contains a viewing, an account or a notification.
  Done when: each point is marked pass in the checklist.
- [x] **QA-EX-05** Clean the dev database of test rows left by e2e runs, with the existing cleanup script; ask the owner before running it in apply mode.
  Done when: the owner confirms the cleanup result.
- [x] **QA-EX-06** Close the phase: update the "Status" paragraphs of `docs/spec/README.md`, root `CLAUDE.md` and `AGENTS.md` (Phase Extra done, real test and DB-check counts, including the `50/50` lines under "Commands" and "Definition of done"); remove the "Changed 12/11/2026 … the code follows after Phase Extra" notes from the spec files; set the status line of [README.md](README.md).
  Done when: the owner approves the texts.

## Questions for the owner

<!-- none yet -->

## Issues log

<!-- date · part and task ID · what failed · what is needed -->

## Final closure — 16/11/2026

Owner accepted this part. The prior blockers are closed by that acceptance; historical logs are preserved with their original scope. No fresh per-case output was supplied with the confirmation. Code was already committed at c5adfde; this follow-up only updates acceptance documents. See [EX-9 ledger](ex-9-qa-checklist.md) for the known test counts, scope exclusions and next phase.
