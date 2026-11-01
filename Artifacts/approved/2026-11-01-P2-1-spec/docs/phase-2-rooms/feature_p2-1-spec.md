# Phase 2 · Part 1 – Spec and task files (P2-SPEC-01..03)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
All parts and their order: [README.md](README.md).

| | |
|---|---|
| Needs first | Part 0 |
| Unblocks | Parts 2 and 7 |
| Draft folder | `Artifacts/2026-11-01-P2-1-spec/` |
| How | By hand, no pipeline |
| Part done when | The draft is approved, applied and committed |

- [~] **P2-SPEC-01** Write the owner's decisions D2-1..D2-18 and the approved rules R2-1..R2-21 of the plan into the spec with rule IDs: `00` (A-03, A-05), `01` (`PRICE_PROPOSAL_EXPIRED`, `UPLOAD_NOT_CONFIGURED`, FILE-01/02, cron at start-up, AUTH-T3 and `OUT_OF_SCOPE` wording left over from Phase 1), `10` (AUTH-08), `11` (BLD-04..07, ROOM-05..09, PUB-01..04, SVC-04/05), `12` (PRC-03..12, RATE-01, RATE-05, RATE-06), `13` (VIEW-01..13), `19` (NOTI-06 in Phase 2), `30` (pages).
  Done when: every D2/R2 item of the plan maps to a rule ID (table in the draft's `REVIEW.md`); links resolve.
- [~] **P2-SPEC-02** Create `docs/phase-2-rooms/` (this README and one file per part) with task IDs `BE-P2-xx` / `FE-P2-xx`, each task with "Done when".
  Done when: every part P2-0..P2-10 of the plan has a file; task IDs are unique.
- [~] **P2-SPEC-03** Fix the DB check command in `docs/phase-1-foundation/feature_p1-1-backend-foundation.md` (`. .` → `. prisma`).
  Done when: same command as `docs/spec/02-database.md`.

## Questions for the owner

None.

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
