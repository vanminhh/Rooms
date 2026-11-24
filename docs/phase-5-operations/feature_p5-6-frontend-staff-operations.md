# Phase 5 · Part 6 – Frontend: staff operations (FE-P5-01..05)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every migration, deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

| | |
|---|---|
| Needs first | P5-1..P5-4 committed |
| Unblocks | P5-7, P5-8 (route frame FE-P5-01) |
| How | planner writes `plans/P5-6/PLAN.md` first |
| Part done when | FE-P5-05 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root), `Source/frontend/CLAUDE.md`, `docs/LESSONS.md`
2. [README.md](README.md) of this phase (owner answers Q-P5-1..16) and `docs/spec/00-overview.md` – **D-45**, UI-01..09
3. [plans/PHASE/PLAN.md](plans/PHASE/PLAN.md) – §3, §4 "P5-6", §7 (fixed-list tests)
4. `docs/spec/30-frontend.md` – `/ql`, `/ql/yeu-cau`, `/ql/thong-bao`, `/ql/hop-dong/:id`; `docs/spec/31-ui-kit.md`; `docs/spec/18-requests.md`
5. Code: `src/app/routes.tsx`, `src/layouts/StaffLayout.tsx`, `src/features/{contracts,notifications,dashboard}/*`, `tests/p3/contracts-dom.mjs`

## Scope

In: route frame for the whole phase, requests board, announcements, renew button, request groups on `/ql`.
Out: reports, audit, settings pages (P5-7), tenant pages (P5-8).

## Tasks

- [ ] **FE-P5-01** Route and menu frame of the phase: `/ql/yeu-cau`, `/ql/thong-bao`, `/ql/bao-cao`, `/ql/nhat-ky` (Boss), `/ql/cai-dat` (Boss), `/thue/thong-bao`, `/thue/yeu-cau`, `/thue/yeu-cau/:id`; stub pages; update every test reading `routes[0..2]` and every expected menu, incl. `auth-login-flow`.
  Done when: `npm run test:components` and `npm run build` pass; a manager opening `/ql/cai-dat` is stopped by the guard, not just a hidden menu.
- [ ] **FE-P5-02** `/ql/yeu-cau`: 3 columns "Chờ xử lý / Đang xử lý / Hoàn thành", shared status labels, filters, detail; approve/reject (confirm dialog, note required on reject), cost for incidents, escalate; D-14 warning shown as the BE sends it; approving RENEW opens the prefilled renewal form (D-45 (15)).
  Done when: UI-03 states (loading/empty/error/data); `PENDING_REQUEST_EXISTS` and `CONFLICT_STATE` show `error.message`; no money math in the FE.
- [ ] **FE-P5-03** `/ql/thong-bao`: send to a room / a building / all buildings (Boss only), confirm dialog, sent list with "đã đọc / tổng"; no edit or delete (D-45 (11)).
  Done when: a manager has no "mọi tòa" option; the list refreshes after sending.
- [ ] **FE-P5-04** "Gia hạn" in `/ql/hop-dong/:id`: term (≥ 3 months), copied services and supplementary clauses, start date and deposit from the BE. Staff can edit or clear the copied clauses when creating the renewal (D-46). Confirm, then use the CON-06 signing path. "Hủy gia hạn" uses the existing cancel (D-45 (10)).
  Done when: non-ACTIVE or already-renewed contract → button disabled with the reason; the screen says no new deposit.
- [ ] **FE-P5-05** ⏸ `npm run lint`, `npm run build`, `npm run test:components` (re-run once if a timing-sensitive case fails).
  Done when: real output.

## Questions for the owner

<!-- Q-P5-1..16 were answered on 24/11/2026 (README.md, D-45). New questions go here and in the README table. -->

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
