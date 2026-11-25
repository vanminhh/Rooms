# Phase 5 · Part 8 – Frontend: tenant (FE-P5-11..16)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every migration, deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

| | |
|---|---|
| Needs first | FE-P5-01 committed; P5-4 and P5-5 committed |
| Unblocks | P5-9 |
| How | main session builds |
| Part done when | FE-P5-16 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root), `Source/frontend/CLAUDE.md`, `docs/LESSONS.md`
2. [README.md](README.md) of this phase (owner answers Q-P5-1..16) and `docs/spec/00-overview.md` – **D-45**, LOC-01, LOC-05, UI-07, UI-12
3. [plans/PHASE/PLAN.md](plans/PHASE/PLAN.md) – §4 "P5-8"
4. `docs/spec/30-frontend.md` – `/thue`, `/thue/hop-dong`, `/thue/hoa-don/:id`, `/thue/yeu-cau`, `/thue/thong-bao`; `docs/spec/18-requests.md`
5. Code: `src/features/notifications/api.ts`, `src/features/invoices/*`, `src/layouts/TenantLayout.tsx`, the chart component of FE-P5-07, `vi.ts`/`en.ts`

## Scope

In: tenant inbox, requests with review, contract and invoice buttons, `/thue` additions, both languages.
Out: staff pages.

## Tasks

- [x] **FE-P5-11** `/thue/thong-bao`: inbox, unread dot, "Đánh dấu đã đọc hết", open `link`; reuse `listMyNotifications`, `readNotification`, `readAllNotifications`.
  Done when: reading one row lowers the unread count at once; read rows stay (dimmed) and still open.
- [x] **FE-P5-12** `/thue/yeu-cau`: list by type, create an incident with up to 5 photos (`REQUEST_PHOTO`), cancel a PENDING request.
  Done when: UI-03 states; the 6th photo is blocked in the FE with vi/en text.
- [x] **FE-P5-13** `/thue/yeu-cau/:id`: status timeline, "Đã sửa xong" / "Chưa ổn" (REQ-06), 1–5 star review + comment after CLOSED, editable 7 days, hidden comment shown as hidden.
  Done when: no review box before CLOSED; read-only after 7 days; BE errors show `error.message`.
- [x] **FE-P5-14** Buttons on `/thue/hop-dong(/:id)` ("Báo trả phòng", "Xin gia hạn", "Cập nhật người ở", "Cập nhật xe") and "Báo lỗi thanh toán" on `/thue/hoa-don/:id` (REQ-07, replaces the FE-P4-13 gap); D-14 warning as sent by the BE.
  Done when: a PENDING request of the same type disables the button with the reason; `PENDING_REQUEST_EXISTS` still shown if clicked in time.
- [x] **FE-P5-15** `/thue` additions: unread count, open requests, 6-period electric/water chart from `GET /me/consumption` with the FE-P5-07 component; every new text in vi and en; money and dates as LOC-05.
  Done when: a contract with only 2 periods still draws; every new key exists in both dictionaries; no FE math.
- [x] **FE-P5-16** ⏸ lint + build + test:components; manual check at 360 px in both languages.
  Done when: real output; owner manual check result.

## Questions for the owner

<!-- Q-P5-1..16 were answered on 24/11/2026 (README.md, D-45). New questions go here and in the README table. -->

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
