# Phase Extra · Part 8 – Viewing notifications and reminders (BE-EX-28..32, FE-EX-29..30)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every migration, deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

| | |
|---|---|
| Fixes | Phase 2 (viewings had no notification); brings forward the part of the Phase 5 inbox that viewings need |
| Needs first | EX-6 and EX-7 committed |
| Unblocks | EX-9 |
| How | planner writes `plans/EX-8/PLAN.md` (backend + frontend) → main session builds |
| Part done when | FE-EX-30 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root), `Source/backend/CLAUDE.md`, `Source/frontend/CLAUDE.md`
2. `docs/spec/00-overview.md` – D-34, A-15, D-20
3. `docs/spec/19-notifications.md` – NOTI-01, NOTI-04, NOTI-06..09, the event table, the API table
4. `docs/spec/13-viewings.md` – VIEW-06, VIEW-07, VIEW-14..19, VIEW-22
5. `docs/spec/01-architecture.md` – Cron table (every job idempotent), LOC-06, DEP-02; `docs/spec/20-reports-audit-settings.md` – `email_templates`
6. Code: `src/modules/notifications/`, `src/modules/mailer/`, `src/modules/viewings/` after EX-6, `src/jobs/room-price-sync.job.ts` (the pattern for a job that also runs at app start), `prisma/schema.prisma` (`Notification`, `Announcement`)
7. Code FE: `src/layouts/GuestLayout.tsx`, `src/features/` after EX-7

## Scope

In: the inbox for viewing events (`/me/notifications`), emails for them, reminders 24 h and 2 h before, the page `/toi/thong-bao`.
Out: announcements and the invoice, contract and request events (Phase 5), SMS and Zalo notifications (D-34, D-20), a real email provider (the mailer still logs in dev; choosing one is a go-live task, say so in the report).

## Tasks

- [ ] **BE-EX-28** ⏸ Check the `notifications` table against NOTI-08 and NOTI-09: the new `kind` values (`VIEWING_CONFIRMED`, `VIEWING_PROPOSED`, `VIEWING_PROPOSAL_REJECTED`, `VIEWING_CANCELLED`, `VIEWING_REMINDER`) and a way to make "one notification per event" and "one reminder per viewing, kind and time in effect" impossible to break (unique key). If that needs a migration, ask the owner before creating and before applying it; add DB-check scenarios.
  Done when: the plan's schema note is confirmed by the owner; DB check passes all scenarios.
- [ ] **BE-EX-29** Inbox API (NOTI-01): `GET /me/notifications?unread`, `POST /me/notifications/:id/read`, `/read-all` for GUEST and TENANT, own rows only, `no-store`.
  Done when: tests: another user's notification id → 404; unread count; read-all.
- [ ] **BE-EX-30** Events (NOTI-08): after each viewing change of EX-6 create the notification for the guest who owns the viewing, in their `locale` (LOC-06), with the texts of the spec table; never for the guest's own action; none for a viewing without an owner account; repeating the same request creates no second row. Email to the guest and to the person responsible when they have an email (A-15); an email failure is logged, retried once and never fails the action (NOTI-07).
  Done when: tests `NOTI-08: …` for each row of the event table, the own-action case, the no-owner case, the repeat case, and a failing mailer.
- [ ] **BE-EX-31** ⏸ Reminders (NOTI-09): a job every 10 minutes and at app start; 24 h and 2 h before the time in effect of a CONFIRMED viewing; a missed reminder is sent late only if the viewing is still in the future; when both are due only the 2 h one is sent; none for a cancelled viewing or an old time; running the job twice sends nothing twice. Old slot viewings have no exact time and get no reminder.
  Done when: tests `NOTI-09: …` with a fixed clock for each sentence above; `npm run lint`, `test`, `build`, `test:e2e` pass. Stop and report BE-EX-28..31.
- [ ] **BE-EX-32** Email templates `viewingConfirmed`, `viewingProposed`, `viewingCancelled`, `viewingReminder` in `vi` and `en` in `settings.email_templates`, with defaults in code when a key is missing.
  Done when: template tests in both languages; times shown in Hà Nội time.
- [ ] **FE-EX-29** `/toi/thong-bao`: inbox, unread dot, "Đánh dấu đã đọc tất cả"; tapping opens the link (the target page checks the reader's rights); unread badge on the "Thông báo" item of `GuestLayout`; list refreshes when the window gets focus.
  Done when: page tests for the four list states (UI-03) and for the badge.
- [ ] **FE-EX-30** ⏸ `npm run lint`, `npm run build`, `npm run test:components`.
  Done when: all pass with real output quoted; manual walk: the manager proposes a time → the guest sees the notification and the email text in the BE log → opens the viewing from it.

## Questions for the owner

- Q-EX8-1 (BE-EX-30): quản lý có nhận email cho **mọi** thao tác của khách (đặt mới, đề xuất, đồng ý, từ chối, hủy) không, hay chỉ cần xem ở "Việc hôm nay"? Spec hiện ghi: có email khi quản lý có địa chỉ email.
  Đề xuất: giữ như spec.

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
