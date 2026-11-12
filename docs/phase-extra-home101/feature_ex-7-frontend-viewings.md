# Phase Extra · Part 7 – Frontend viewings: booking, my viewings, staff page (FE-EX-22..28)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

| | |
|---|---|
| Fixes | Phase 2 (booking form, staff viewing page, "Việc hôm nay") and the UI work (booking panel) |
| Needs first | EX-2 and EX-6 committed; EX-3 committed if English is wanted from the start (else write Vietnamese texts ready for the dictionary) |
| Unblocks | EX-8 |
| How | planner writes `plans/EX-7/PLAN.md` (three areas: public, guest, staff) → main session builds |
| Part done when | FE-EX-28 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root) and `Source/frontend/CLAUDE.md`
2. `docs/spec/13-viewings.md` – all of it; the API table is the contract
3. `docs/spec/30-frontend.md` – rows `/phong/:id`, `/toi`, `/toi/lich-hen/:id`, `/ql/lich-hen`, `/ql`; UI-02..05, UI-07..09
4. `docs/spec/31-ui-kit.md` – KIT-01, KIT-05..07; `docs/spec/19-notifications.md` – NOTI-06
5. Code: `src/features/public/` (`ViewingForm.tsx`, `viewing-schema.ts`, `BookingJumpBar.tsx`, `booking-panel.css`), `src/pages/public/RoomDetailView.tsx`, `src/features/viewings/`, `src/pages/staff/ViewingsPage.tsx`, `StaffHomePage.tsx`, `src/features/dashboard/`, `src/shared/status-labels.ts`, tests `tests/p2/fe-p2-17-viewing-form.test.mjs`, `ui-24-booking-panel.test.mjs`, `fe12-*.test.mjs`

## Scope

In: the booking panel with exact times and the login gate, the guest's list and detail, the staff page with proposals, the dashboard card, the two new status labels.
Out: the inbox page and email (EX-8), "Chốt" → contract form (Phase 3), anything on the backend.

## Tasks

- [ ] **FE-EX-22** API and labels: `features/viewings/api.ts` and a guest API for `/me/viewings*` following the spec 13 table; statuses `DONE` "Đã xem" and `NO_SHOW` "Khách không đến" in `status-labels.ts`; the turn texts "Chờ quản lý phản hồi" / "Chờ bạn phản hồi" (VIEW-10); old viewings show their slot label (VIEW-08).
  Done when: label tests with the spec texts; API tests for every route used.
- [ ] **FE-EX-23** Booking panel on `/phong/:id` (VIEW-01, VIEW-08): date shortcuts, then the start times from `/public/rooms/:id/viewing-times`; not logged in → "Đăng nhập để đặt lịch" (returns to this room after login or sign-up); phone not verified → "Xác minh số điện thoại để đặt lịch"; success → link to `/toi/lich-hen/:id`. Remove the old 3-slot form and its honeypot field.
  Done when: tests for the three states and for 429 and `ROOM_NOT_AVAILABLE` messages; `ui-24-booking-panel.test.mjs` rewritten to the new panel; nothing posts to `/public/viewings`.
- [ ] **FE-EX-24** ⏸ `/toi` "Lịch hẹn của tôi" (VIEW-20, VIEW-21): viewings waiting for the guest first, then upcoming, then past; each with room, time in effect, status and whose turn; the card "Bạn có N lịch hẹn cũ theo số điện thoại này" with a confirm step to claim; loading, empty, error states (UI-03).
  Done when: page tests; claiming needs the confirm click; mobile check at 360 px. Stop and report FE-EX-22..24.
- [ ] **FE-EX-25** `/toi/lich-hen/:id` (VIEW-14..19, VIEW-22): room and building, time in effect, the pending proposal with "Đồng ý" / "Từ chối" / "Đề xuất giờ khác", "Hủy lịch" with a confirm dialog (hidden after the start time), the contact of the person responsible, the history with "Ghi nhận qua điện thoại" where it applies. `CONFLICT_STATE`, `PROPOSAL_EXPIRED` and `VIEWING_TIME_TAKEN` show the API message and reload the viewing.
  Done when: page tests for each action and each of the three errors; a confirmed time is still shown as confirmed while a proposal is pending.
- [ ] **FE-EX-26** Staff `/ql/lich-hen` (VIEW-04, VIEW-07, VIEW-09, VIEW-14..19, VIEW-23): list by date and time; "Xác nhận" or "Đề xuất giờ khác" on a request; answer to a guest proposal; "Ghi nhận qua điện thoại" with a required note; "Đã xem" / "Khách không đến" only after the start time; marks "Quá giờ, chưa xác nhận" and "Trùng giờ"; history; manual add with an exact time (VIEW-03). The time can no longer be edited directly.
  Done when: page tests; `fe12-viewings-page.test.mjs` and `fe12-viewing-form.test.mjs` updated and green.
- [ ] **FE-EX-27** "Việc hôm nay": the viewing card counts viewings waiting for staff and lists overdue and overlapping ones (VIEW-07, NOTI-06).
  Done when: `fe12-dashboard.test.mjs` updated with the new fields and green.
- [ ] **FE-EX-28** ⏸ `npm run lint`, `npm run build`, `npm run test:components`.
  Done when: all pass with real output quoted; manual walk with two browsers (a guest and the building's manager): book → manager proposes → guest accepts → guest proposes a change → manager accepts → guest cancels.

## Questions for the owner

<!-- none yet -->

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
