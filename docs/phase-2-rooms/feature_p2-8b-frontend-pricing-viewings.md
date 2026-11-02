# Phase 2 · Part 8b – Frontend rates, price approval, viewings, "Việc hôm nay" (FE-P2-09..13)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified on the main files. Do tasks in order. Every task is drafted in `Source/frontend/artifact_FE/` and approved by the owner before it touches main files (root `CLAUDE.md`). All parts and their order: [README.md](README.md).

| | |
|---|---|
| Needs first | Backend part 6 and frontend part 8a on the main files |
| Unblocks | Part 10 |
| Draft folder | `Source/frontend/artifact_FE/<YYYY-MM-DD>-FE-P2-09-13/` |
| How | Pipeline (may run in parallel with part 9) |
| Part done when | FE-P2-13 on the main files; "manager proposes → Boss approves → price changes" works in the browser |

Do not edit `routes.tsx`, `package.json` or `src/components/` (skeleton of part 8a). Tests go in `tests/p2/`.

## Before you start (read, in this order)

1. `CLAUDE.md` (root) and `Source/frontend/CLAUDE.md`
2. `docs/spec/12-pricing.md` – PRC-01..12, RATE-01..06; `docs/spec/13-viewings.md` – VIEW-03, 04, 07..10, 13
3. `docs/spec/19-notifications.md` – NOTI-06 Phase 2 note; `docs/spec/30-frontend.md`, `docs/spec/31-ui-kit.md`
4. The approved mockup of part 7 ("Duyệt giá")

## Tasks

- [ ] **FE-P2-09** "Đề xuất giá" on `/ql/phong`: dialog, "Quá hạn" and "Đề xuất lại" (PRC-07).
  Done when: tests; API errors on fields.
- [ ] **FE-P2-10** `/ql/don-gia`: current rates per building (tier ladder), upcoming rates, history, propose, proposal status.
  Done when: tests for tier input matching RATE-02.
- [ ] **FE-P2-11** `/ql/duyet-gia` (Boss): PRC-12 table, confirm dialog with the amount and the PRC-08 note (UI-04), reject with note, expired apart.
  Done when: tests; values and % come from the API (UI-06).
- [ ] **FE-P2-12** `/ql/lich-hen`: by date, manual add (VIEW-03), call / Zalo buttons, status changes allowed by VIEW-04, change date/slot (VIEW-09); no "Chốt" yet. `/ql` shows the two cards (NOTI-06 Phase 2).
  Done when: tests for allowed status buttons per status and the two cards per role.
- [ ] **FE-P2-13** `npm run lint`, `npm run build`, `npm run test:components` pass; manual flow after applying.
  Done when: all pass.

## Questions for the owner

None yet.

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
