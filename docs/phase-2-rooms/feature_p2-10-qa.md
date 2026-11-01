# Phase 2 · Part 10 – QA and close (P2-QA-01..05)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
All parts and their order: [README.md](README.md).

| | |
|---|---|
| Needs first | Parts 2–9 on the main files |
| Unblocks | Phase 3 · Contracts |
| How | By hand |
| Part done when | Every step passes and "Status" in `CLAUDE.md` and `docs/spec/README.md` says Phase 3 (through a draft) |

## Phase 2 exit (roadmap)

1. A guest filters rooms (district, ward, building, price), opens a room, books a viewing; the building's manager (or Boss when the building has no active manager) sees it in "Việc hôm nay" and handles it.
2. A manager proposes a room price / rate → the public price does not change until Boss approves; a price approved for a later date applies at 01:00 (or at the next app start).
3. Every acceptance case of spec 10 (new ones), 11, 12, 13 has a test with its ID and passes, except the ones that need contracts or invoices (spec 11 "HOLD contract removes the room", spec 12 "84 kWh", "0 kWh", spec 13 "HOLD contract cancels viewing B" – Phase 3/4). BE `lint`, `test`, `test:e2e` and FE `lint`, `build`, `test:components` pass; DB check 50/50.

## Tasks

- [ ] **P2-QA-01** Step-by-step manual checklist in Vietnamese (written into this file) covering exit 1 and 2, at 360 px and with the keyboard.
  Done when: every step marked "đạt" by the owner.
- [ ] **P2-QA-02** Automated checks on the main files: the commands of exit 3; DB check `node prisma/check-constraints.mjs . prisma` (needs `npm i --no-save @electric-sql/pglite@0.2`).
  Done when: real output pasted into the Issues log.
- [ ] **P2-QA-03** Test data: `node test/e2e-cleanup.mjs` (list mode); the owner reviews the list; `--apply <runId>` only for runs the owner agrees to.
  Done when: no log left outside `CLEANED`, or the owner accepted what is left.
- [ ] **P2-QA-04** Production notes carried over: in-memory limits (login, viewing IP), console mailer, seed without production guard, `engines` Node ≥ 24.2, `trust proxy` behind a proxy, orphan Cloudinary uploads.
  Done when: listed in the Phase 2 summary for the owner.
- [ ] **P2-QA-05** Draft: "Status" in `CLAUDE.md` and `docs/spec/README.md` → Phase 3 · Contracts.
  Done when: approved, applied, committed.

## Questions for the owner

None yet.

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
