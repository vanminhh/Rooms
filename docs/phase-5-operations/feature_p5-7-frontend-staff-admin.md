# Phase 5 · Part 7 – Frontend: staff admin (FE-P5-06..10)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every migration, deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

| | |
|---|---|
| Needs first | P5-5 and FE-P5-01 committed; owner approves the chart package before install |
| Unblocks | P5-8 (chart component) |
| How | main session builds |
| Part done when | FE-P5-10 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root), `Source/frontend/CLAUDE.md`, `docs/LESSONS.md`
2. [README.md](README.md) of this phase (owner answers Q-P5-1..16) and `docs/spec/00-overview.md` – **D-45**, UI-06, UI-07
3. [plans/PHASE/PLAN.md](plans/PHASE/PLAN.md) – §4 "P5-7"
4. `docs/spec/30-frontend.md` – `/ql`, `/ql/bao-cao`, `/ql/nhat-ky`, `/ql/cai-dat`; `docs/spec/20-reports-audit-settings.md`; `docs/spec/31-ui-kit.md`
5. Code: the `reports`, `audit`, `settings` API of P5-5; `src/features/dashboard/*`

## Scope

In: reports, audit log, settings pages, occupancy ring and collected/outstanding bar on `/ql`.
Out: tenant chart page (P5-8 reuses the component).

## Tasks

- [x] **FE-P5-06** `/ql/bao-cao`: revenue bars + profit line, outstanding with overdue apart, occupancy, deposits held; Boss: per-building comparison and the red overdue list with "Sửa / Xóa / Cất" (confirm dialogs, reason required for "Xóa").
  Done when: a manager sees only their buildings and no comparison block; every amount comes from the API (UI-06).
- [~] **FE-P5-07** Charts with the approved **chart library** (D-45 (8)): bar, line, ring, wrapped in one component of `features/reports` reused by `/thue`; colors and text from kit tokens. Ask the owner for the package name + version and wait before installing (suggested `recharts`).
  Done when: the package is in `package.json` only after approval; `npm run build` passes; readable at 360 px with text labels for keyboard and screen readers.
- [x] **FE-P5-08** `/ql/nhat-ky` (Boss): filters entity, entityId, actorId, dates; paging; before/after shown in full as returned (D-45 (16)).
  Done when: UI-03 states; a manager opening the URL is stopped by the guard.
- [x] **FE-P5-09** `/ql/cai-dat` (Boss): bank account, webhook read-only with how to turn it off by changing the secret (D-45 (5)), contract template (draft flag shown, D-45 (14)), email templates, default contact; one save per block with confirm; `error.fields` on inputs (UI-05). Add the occupancy ring and collected/outstanding bar to `/ql`.
  Done when: a bad `bank_account` shows the error on the right field; the draft template shows "BẢN NHÁP – chưa dùng để ký".
- [~] **FE-P5-10** ⏸ lint + build + test:components; manual check at 360 px.
  Done when: real output; owner manual check result.

## Questions for the owner

<!-- Q-P5-1..16 were answered on 24/11/2026 (README.md, D-45). New questions go here and in the README table. -->

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
