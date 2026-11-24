# Phase 5 · Part 1 – Backend: announcements (BE-P5-01..04)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every migration, deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

| | |
|---|---|
| Needs first | M0 committed |
| Unblocks | P5-3 (REQUEST_UPDATED uses the same inbox), P5-6, P5-8 |
| How | main session builds; reviewer before the stop (authorization) |
| Part done when | BE-P5-04 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root), `Source/backend/CLAUDE.md`, `docs/LESSONS.md`
2. [README.md](README.md) of this phase (owner answers Q-P5-1..16) and `docs/spec/00-overview.md` – **D-45**, D-34
3. [plans/PHASE/PLAN.md](plans/PHASE/PLAN.md) – §2, §3, §4 "P5-1", §7, §8
4. `docs/spec/19-notifications.md` – NOTI-01, NOTI-02, NOTI-03, event table
5. Code: `src/modules/notifications/notify.ts`, `my-notifications.{controller,service}.ts`, `src/common/scope/scope.ts`

## Scope

In: `GET/POST /announcements`, tenant inbox checks (no new tenant API).
Out: email (Q-P5-4: in-app only), editing or deleting a sent announcement (Q-P5-11), FE pages.

## Tasks

- [ ] **BE-P5-01** `POST /announcements` (NOTI-02, NOTI-03): scope one room, one building, or all buildings (`buildingId = null`, BOSS only); manager only in scope (SCOPE-02). One transaction: create `announcements`, then `createMany` one `notifications` row (`kind = ANNOUNCEMENT`, `link = /thue/thong-bao`, `announcementId`) per tenant with an ACTIVE contract in scope. No email (D-45 (4)).
  Done when: a room without an ACTIVE contract → 0 notification rows but the announcement is saved; manager with `buildingId = null` → `FORBIDDEN`; another building → `OUT_OF_SCOPE`; `roomId` of another building → `VALIDATION_FAILED`; two tenants in one room each get one row.
- [ ] **BE-P5-02** `GET /announcements?buildingId` (staff in scope, API-02 paging): sender, scope (building/room name), `createdAt`, "đã đọc / tổng" counted from `notifications.readAt`. No update or delete route (D-45 (11)).
  Done when: an all-buildings announcement is listed only for Boss; a manager sees only their scope; the read count changes after a tenant reads it.
- [ ] **BE-P5-03** Check the tenant inbox is complete for `/thue/thong-bao`: `GET /me/notifications?unread`, `POST /me/notifications/:id/read`, `/read-all` already allow TENANT and filter by `userId` (SCOPE-03). Add only the missing tests; fix if something differs.
  Done when: TENANT reads own list with `meta.unreadCount`; another user's row → `NOT_FOUND`; GUEST → `FORBIDDEN`; `Cache-Control: no-store` kept.
- [ ] **BE-P5-04** ⏸ `npm run lint`, `npm run test`, `npm run build`; reviewer before the stop.
  Done when: real output pasted into the report; `[ASSUMPTION]`s listed.

## Questions for the owner

<!-- Q-P5-1..16 were answered on 24/11/2026 (README.md, D-45). New questions go here and in the README table. -->

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
